import { getDb } from "@/lib/db";
import { getSupabase } from "@/lib/supabase/client";
import type {
  AiProfile,
  AiRecommendation,
  Book,
  BookNote,
  BookQuote,
  PreferenceProfile,
  ReadingGoals,
  ReadingSession,
  UserBook,
  WrappedSummary,
} from "@/lib/types";

// 로컬(Dexie) → Supabase 1회 이관 — 백업 유틸 성격상 Repository 경계 대신 DB에 직접 접근한다
// One-shot local(Dexie) → Supabase migration; reads Dexie directly like the backup utility
// 로컬 데이터는 지우지 않고 이관 완료 플래그만 남긴다 (설계 §4 — 안전 우선)
// Local data is kept intact; only a migrated flag is recorded (design §4)

// 이관 플래그는 계정별로 저장한다 — 한 기기에서 다른 계정으로 로그인해도 안내가 뜨도록
// The migrated flag is per account, so a second account on this device still gets the prompt
const MIGRATED_FLAG_PREFIX = "rive-local-migrated:";

export function isLocalMigrated(userId: string): boolean {
  try {
    return window.localStorage.getItem(MIGRATED_FLAG_PREFIX + userId) === "1";
  } catch (error) {
    console.error("[migrate] failed to read migrated flag:", error);
    return false;
  }
}

function markLocalMigrated(userId: string): void {
  try {
    window.localStorage.setItem(MIGRATED_FLAG_PREFIX + userId, "1");
  } catch (error) {
    console.error("[migrate] failed to write migrated flag:", error);
  }
}

// 이관 여부 판단용 — 로컬에 옮길 데이터가 있는지
// Whether the local store has anything worth migrating
export async function hasLocalData(): Promise<boolean> {
  const db = getDb();
  const [bookCount, sessionCount] = await Promise.all([
    db.books.count(),
    db.readingSessions.count(),
  ]);
  return bookCount > 0 || sessionCount > 0;
}

// 내보내기 페이로드와 같은 모양의 도메인 테이블 묶음 — 이관과 서버 가져오기가 공유한다
// Domain-table bundle matching the export payload; shared by migration and server import
export interface DomainTables {
  books?: Book[];
  userBooks?: UserBook[];
  readingSessions?: ReadingSession[];
  notes?: BookNote[];
  quotes?: BookQuote[];
  preferences?: PreferenceProfile[];
  aiProfiles?: AiProfile[];
  recommendations?: AiRecommendation[];
  goals?: ReadingGoals[];
  wrapped?: WrappedSummary[];
}

// 서버에 이미 있는 같은 책(다른 id)을 찾아 로컬 id → 서버 id 매핑을 만든다 (7차 D1)
// Builds a local→server id map for books that already exist under a different id (audit 7 D1)
// 매칭 기준은 로컬 upsertBookByIsbn과 동일 — isbn13 우선, 없으면 제목+저자
// Matching mirrors the local upsert: isbn13 first, then title+authors
async function buildBookIdMap(
  books: Book[],
): Promise<{ idMap: Map<string, string>; serverIds: Set<string> }> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("books").select("id, isbn13, title, authors");
  if (error) {
    throw new Error(`[migrate] books preload: ${error.message}`);
  }
  const serverBooks = (data ?? []) as { id: string; isbn13: string; title: string; authors: string[] }[];
  const byIsbn = new Map<string, string>();
  const byTitleAuthors = new Map<string, string>();
  const serverIds = new Set<string>();
  for (const row of serverBooks) {
    serverIds.add(row.id);
    if (row.isbn13) {
      byIsbn.set(row.isbn13, row.id);
    }
    byTitleAuthors.set(`${row.title}|${row.authors.join(",")}`, row.id);
  }

  const idMap = new Map<string, string>();
  for (const book of books) {
    const serverId = book.isbn13
      ? byIsbn.get(book.isbn13)
      : byTitleAuthors.get(`${book.title}|${book.authors.join(",")}`);
    if (serverId && serverId !== book.id) {
      idMap.set(book.id, serverId);
    }
  }
  return { idMap, serverIds };
}

const VALID_STATUSES = new Set(["reading", "want", "read", "paused", "dnf"]);

// 도메인 테이블을 Supabase에 참조 순서대로 upsert한다 (RLS가 본인 행만 허용)
// Upserts domain tables to Supabase in reference order (RLS scopes to the owner)
// 서버에 같은 책이 있으면 id를 재매핑하고, 참조가 깨진/값이 손상된 행은 걸러낸다 (7차 D1·D4·D7)
// Remaps ids onto existing server books and filters broken rows (audit 7 D1, D4, D7)
export async function uploadDomainTables(tables: DomainTables): Promise<{ imported: number }> {
  const supabase = getSupabase();

  const fail = (context: string, message: string): never => {
    throw new Error(`[migrate] ${context}: ${message}`);
  };

  const allBooks = tables.books ?? [];
  for (const book of allBooks) {
    if (typeof book?.id !== "string" || typeof book?.title !== "string") {
      fail("books", "invalid row");
    }
  }
  const { idMap, serverIds } = await buildBookIdMap(allBooks);
  // 서버에 이미 있는 책은 서버 행을 유지한다(중복 생성·덮어쓰기 방지)
  // Books already on the server keep their server rows (no duplicates, no clobbering)
  const books = allBooks.filter((book) => !idMap.has(book.id));
  const mapBookId = (bookId: string): string => idMap.get(bookId) ?? bookId;
  // 자식 행이 참조할 수 있는 유효한 책 id 집합 (업로드분 + 재매핑분 + 서버 기존분)
  // Book ids children may reference (uploaded, remapped, and pre-existing server books)
  const knownBookIds = new Set<string>([
    ...books.map((book) => book.id),
    ...idMap.values(),
    ...serverIds,
  ]);

  // 자식 테이블은 book_id를 재매핑하고, 깨진 참조가 하나라도 있으면 전체 가져오기를 중단한다
  // Remap child book ids and abort the whole import if any reference is broken.
  const requireKnownBook = (context: string, bookId: unknown): string => {
    if (typeof bookId !== "string") {
      return fail(context, "invalid book reference");
    }
    const mapped = mapBookId(bookId);
    if (!knownBookIds.has(mapped)) {
      fail(context, `unknown book reference: ${bookId}`);
    }
    return mapped;
  };

  const userBooks = (tables.userBooks ?? []).map((userBook) => {
    if (!VALID_STATUSES.has(userBook?.status)) {
      fail("userBooks", "invalid status");
    }
    return { ...userBook, bookId: requireKnownBook("userBooks", userBook?.bookId) };
  });

  const sessions = (tables.readingSessions ?? []).map((session) => {
    if (typeof session?.id !== "string") fail("readingSessions", "invalid row");
    return { ...session, bookId: requireKnownBook("readingSessions", session?.bookId) };
  });

  const notes = (tables.notes ?? []).map((note) => {
    if (typeof note?.id !== "string") fail("notes", "invalid row");
    return { ...note, bookId: requireKnownBook("notes", note?.bookId) };
  });

  const quotes = (tables.quotes ?? []).map((quote) => {
    if (typeof quote?.id !== "string") fail("quotes", "invalid row");
    return { ...quote, bookId: requireKnownBook("quotes", quote?.bookId) };
  });

  // 나머지 테이블은 형태만 가볍게 거른다 — 상세 검증과 원자성은 RPC 트랜잭션이 맡는다
  // Light shape filtering for the rest; the RPC transaction owns atomicity
  const isObject = (row: unknown): boolean => typeof row === "object" && row !== null;
  const payload = {
    books,
    userBooks,
    readingSessions: sessions,
    notes,
    quotes,
    preferences: (tables.preferences ?? []).filter(isObject),
    aiProfiles: (tables.aiProfiles ?? []).filter(isObject),
    recommendations: (tables.recommendations ?? []).filter(
      (item) => isObject(item) && typeof item?.id === "string",
    ),
    goals: (tables.goals ?? []).filter((goal) => isObject(goal) && Number.isFinite(goal?.year)),
    wrapped: (tables.wrapped ?? []).filter(
      (entry) => isObject(entry) && typeof entry?.id === "string",
    ),
  };

  // 전 테이블을 단일 plpgsql 트랜잭션으로 upsert — 부분 반영 상태가 남지 않는다 (7차 D4)
  // Upsert everything in one plpgsql transaction — no partial state left behind (audit 7 D4)
  const { data, error } = await supabase.rpc("import_user_data", { p: payload });
  if (error) {
    fail("import_user_data", error.message);
  }
  return { imported: typeof data === "number" ? data : 0 };
}

export async function migrateLocalToSupabase(): Promise<{ imported: number }> {
  const db = getDb();

  const tables: DomainTables = {
    books: (await db.books.toArray()) as Book[],
    userBooks: (await db.userBooks.toArray()) as UserBook[],
    readingSessions: (await db.readingSessions.toArray()) as ReadingSession[],
    notes: (await db.notes.toArray()) as BookNote[],
    quotes: (await db.quotes.toArray()) as BookQuote[],
    preferences: (await db.preferences.toArray()) as PreferenceProfile[],
    aiProfiles: (await db.aiProfiles.toArray()) as AiProfile[],
    recommendations: (await db.recommendations.toArray()) as AiRecommendation[],
    goals: (await db.goals.toArray()) as ReadingGoals[],
    wrapped: (await db.wrapped.toArray()) as WrappedSummary[],
  };

  const result = await uploadDomainTables(tables);

  // 이관 완료를 현재 계정에 기록한다
  // Record completion for the current account
  const { data } = await getSupabase().auth.getUser();
  if (data.user) {
    markLocalMigrated(data.user.id);
  }
  return result;
}
