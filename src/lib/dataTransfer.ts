import { getDb } from "@/lib/db";
import { notifyLibraryChange } from "@/lib/libraryEvents";
import {
  rowToBook,
  rowToRecommendation,
  rowToSession,
  rowToUserBook,
  type BookRow,
  type RecommendationRow,
  type SessionRow,
  type UserBookRow,
} from "@/lib/repository/supabaseRepository";
import { getSupabase, isServerMode } from "@/lib/supabase/client";
import { uploadDomainTables, type DomainTables } from "@/lib/supabase/migrateLocal";
import type {
  AiProfile,
  BookNote,
  BookQuote,
  PreferenceProfile,
  ReadingGoals,
  WrappedSummary,
} from "@/lib/types";

// 데이터 백업/복원 — 일회성 상태인 activeSession을 제외한 전 테이블을 JSON으로 내보내고 id 기준 병합 복원 (스펙 §82)
// Data backup/restore — exports every table except the transient activeSession, restores with id-based merge (spec §82)
// 로컬 모드는 Dexie, 서버 모드(로그인)는 Supabase를 대상으로 한다 — 파일 형식은 동일 (2차 B6 후속)
// Local mode targets Dexie; server mode targets Supabase — same file format (phase-2 B6 follow-up)
// 주의: 백업 유틸 성격상 Repository 경계 대신 저장소에 직접 접근한다
// Note: as a backup utility this bypasses the repository boundary

const EXPORT_VERSION = 1;

const TABLE_NAMES = [
  "books",
  "userBooks",
  "readingSessions",
  "preferences",
  "aiProfiles",
  "recommendations",
  "notes",
  "quotes",
  "goals",
  "wrapped",
] as const;

type TableName = (typeof TABLE_NAMES)[number];

export interface ExportPayload {
  app: "rive";
  version: number;
  exportedAt: number;
  tables: Partial<Record<TableName, unknown[]>>;
}

const VALID_BOOK_STATUSES = new Set(["reading", "want", "read", "paused", "dnf"]);
const VALID_RECOMMENDATION_STATUSES = new Set([
  "active",
  "want",
  "liked",
  "notInterested",
  "alreadyRead",
]);
const VALID_FICTION_PREFERENCES = new Set(["fiction", "nonfiction", "both"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegative(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isOptionalNonNegative(value: unknown): boolean {
  return value === undefined || isNonNegative(value);
}

function isRating(value: unknown): boolean {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= 1 && value <= 5;
}

function isBookRef(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.title) &&
    isStringArray(value.authors) &&
    isString(value.isbn13) &&
    isString(value.coverUrl)
  );
}

function isSearchBook(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.title) &&
    isStringArray(value.authors) &&
    isString(value.publisher) &&
    isString(value.isbn13) &&
    isString(value.coverUrl) &&
    isNonNegative(value.pageCount) &&
    isString(value.kakaoUrl) &&
    isString(value.googleBooksId) &&
    isOptionalString(value.description)
  );
}

function requireRow(
  condition: boolean,
  table: TableName,
  index: number,
  field: string,
): asserts condition {
  if (!condition) {
    throw new Error(`invalid backup row: ${table}[${index}].${field}`);
  }
}

export function parseBackupPayload(text: string): ExportPayload {
  const payload = JSON.parse(text) as unknown;
  if (
    !isRecord(payload) ||
    payload.app !== "rive" ||
    !isFiniteNumber(payload.version) ||
    !isFiniteNumber(payload.exportedAt) ||
    !isRecord(payload.tables)
  ) {
    throw new Error("not a rive backup file");
  }
  if (payload.version > EXPORT_VERSION) {
    throw new Error(`unsupported backup version: ${payload.version}`);
  }
  return payload as unknown as ExportPayload;
}

/** Validates the complete local restore before any table is mutated. */
export function validateImportTables(
  tables: ExportPayload["tables"],
  existingBookIds: ReadonlySet<string> = new Set(),
  validateBookReferences = true,
): Partial<Record<TableName, Record<string, unknown>[]>> {
  const normalized: Partial<Record<TableName, Record<string, unknown>[]>> = {};
  for (const name of TABLE_NAMES) {
    const value = tables[name];
    if (value === undefined) continue;
    if (!Array.isArray(value)) throw new Error(`invalid backup table: ${name}`);
    normalized[name] = value.map((row, index) => {
      requireRow(isRecord(row), name, index, "row");
      return row as Record<string, unknown>;
    });
  }

  const books = normalized.books ?? [];
  const knownBookIds = new Set(existingBookIds);
  books.forEach((row, index) => {
    requireRow(isString(row.id) && row.id.length > 0, "books", index, "id");
    requireRow(isString(row.title) && row.title.length > 0, "books", index, "title");
    requireRow(isStringArray(row.authors), "books", index, "authors");
    requireRow(isString(row.publisher), "books", index, "publisher");
    requireRow(isString(row.isbn13), "books", index, "isbn13");
    requireRow(isString(row.coverUrl), "books", index, "coverUrl");
    requireRow(isNonNegative(row.pageCount), "books", index, "pageCount");
    requireRow(isString(row.kakaoUrl), "books", index, "kakaoUrl");
    requireRow(isString(row.googleBooksId), "books", index, "googleBooksId");
    requireRow(isNonNegative(row.createdAt), "books", index, "createdAt");
    requireRow(isOptionalString(row.description), "books", index, "description");
    requireRow(row.categories === undefined || isStringArray(row.categories), "books", index, "categories");
    requireRow(isOptionalNonNegative(row.enrichedAt), "books", index, "enrichedAt");
    knownBookIds.add(row.id as string);
  });

  const validateBookRef = (row: Record<string, unknown>, table: TableName, index: number) =>
    requireRow(
      isString(row.bookId) && (!validateBookReferences || knownBookIds.has(row.bookId)),
      table,
      index,
      "bookId",
    );

  (normalized.userBooks ?? []).forEach((row, index) => {
    validateBookRef(row, "userBooks", index);
    requireRow(isString(row.status) && VALID_BOOK_STATUSES.has(row.status), "userBooks", index, "status");
    requireRow(isNonNegative(row.currentPage), "userBooks", index, "currentPage");
    requireRow(row.startedAt === null || isNonNegative(row.startedAt), "userBooks", index, "startedAt");
    requireRow(row.finishedAt === null || isNonNegative(row.finishedAt), "userBooks", index, "finishedAt");
    requireRow(isNonNegative(row.createdAt), "userBooks", index, "createdAt");
    requireRow(isNonNegative(row.lastReadAt), "userBooks", index, "lastReadAt");
    requireRow(row.rating === undefined || isRating(row.rating), "userBooks", index, "rating");
    requireRow(isOptionalString(row.dnfReason), "userBooks", index, "dnfReason");
    if (row.extraRatings !== undefined) {
      requireRow(isRecord(row.extraRatings), "userBooks", index, "extraRatings");
      for (const field of ["fun", "immersion", "difficulty"] as const) {
        requireRow(
          row.extraRatings[field] === undefined || isRating(row.extraRatings[field]),
          "userBooks",
          index,
          `extraRatings.${field}`,
        );
      }
    }
    requireRow(isOptionalNonNegative(row.upNextAt), "userBooks", index, "upNextAt");
    requireRow(isOptionalNonNegative(row.targetDate), "userBooks", index, "targetDate");
  });

  (normalized.readingSessions ?? []).forEach((row, index) => {
    requireRow(isString(row.id) && row.id.length > 0, "readingSessions", index, "id");
    validateBookRef(row, "readingSessions", index);
    requireRow(isNonNegative(row.startedAt), "readingSessions", index, "startedAt");
    requireRow(isNonNegative(row.endedAt) && row.endedAt >= (row.startedAt as number), "readingSessions", index, "endedAt");
    requireRow(isNonNegative(row.durationSeconds), "readingSessions", index, "durationSeconds");
    requireRow(isNonNegative(row.startPage), "readingSessions", index, "startPage");
    requireRow(isNonNegative(row.endPage) && row.endPage >= (row.startPage as number), "readingSessions", index, "endPage");
    requireRow(isNonNegative(row.pagesRead), "readingSessions", index, "pagesRead");
    requireRow(isString(row.memo), "readingSessions", index, "memo");
    requireRow(isNonNegative(row.createdAt), "readingSessions", index, "createdAt");
  });

  (normalized.notes ?? []).forEach((row, index) => {
    requireRow(isString(row.id) && row.id.length > 0, "notes", index, "id");
    validateBookRef(row, "notes", index);
    requireRow(isString(row.content), "notes", index, "content");
    requireRow(isNonNegative(row.createdAt), "notes", index, "createdAt");
  });
  (normalized.quotes ?? []).forEach((row, index) => {
    requireRow(isString(row.id) && row.id.length > 0, "quotes", index, "id");
    validateBookRef(row, "quotes", index);
    requireRow(isNonNegative(row.page), "quotes", index, "page");
    requireRow(isString(row.quote), "quotes", index, "quote");
    requireRow(isString(row.comment), "quotes", index, "comment");
    requireRow(isNonNegative(row.createdAt), "quotes", index, "createdAt");
  });

  (normalized.preferences ?? []).forEach((row, index) => {
    requireRow(row.id === "primary", "preferences", index, "id");
    requireRow(isStringArray(row.favoriteGenres), "preferences", index, "favoriteGenres");
    requireRow(isStringArray(row.dislikedGenres), "preferences", index, "dislikedGenres");
    requireRow(Array.isArray(row.lovedBooks) && row.lovedBooks.every(isBookRef), "preferences", index, "lovedBooks");
    requireRow(Array.isArray(row.dislikedBooks) && row.dislikedBooks.every(isBookRef), "preferences", index, "dislikedBooks");
    requireRow(
      isString(row.fictionPreference) && VALID_FICTION_PREFERENCES.has(row.fictionPreference),
      "preferences",
      index,
      "fictionPreference",
    );
    requireRow(isStringArray(row.readingPurposes), "preferences", index, "readingPurposes");
    requireRow(isOptionalString(row.ageRange), "preferences", index, "ageRange");
    requireRow(isOptionalString(row.gender), "preferences", index, "gender");
    requireRow(isNonNegative(row.updatedAt), "preferences", index, "updatedAt");
  });
  (normalized.aiProfiles ?? []).forEach((row, index) => {
    requireRow(row.id === "current", "aiProfiles", index, "id");
    requireRow(isString(row.profileType), "aiProfiles", index, "profileType");
    requireRow(isString(row.summary), "aiProfiles", index, "summary");
    requireRow(
      Array.isArray(row.genres) &&
        row.genres.every(
          (genre) =>
            isRecord(genre) &&
            isString(genre.name) &&
            isFiniteNumber(genre.score) &&
            genre.score >= 0 &&
            genre.score <= 100,
        ),
      "aiProfiles",
      index,
      "genres",
    );
    requireRow(isStringArray(row.traits), "aiProfiles", index, "traits");
    requireRow(isStringArray(row.recommendationFactors), "aiProfiles", index, "recommendationFactors");
    requireRow(isStringArray(row.evidence), "aiProfiles", index, "evidence");
    requireRow(row.tasteChanges === undefined || isStringArray(row.tasteChanges), "aiProfiles", index, "tasteChanges");
    requireRow(
      row.dna === undefined ||
        (isRecord(row.dna) &&
          [row.dna.fiction, row.dna.depth, row.dna.emotion, row.dna.exploration].every(
            (score) => isFiniteNumber(score) && score >= 0 && score <= 100,
          )),
      "aiProfiles",
      index,
      "dna",
    );
    requireRow(
      row.bookTwin === undefined ||
        (isRecord(row.bookTwin) && isString(row.bookTwin.title) && isString(row.bookTwin.reason)),
      "aiProfiles",
      index,
      "bookTwin",
    );
    requireRow(isNonNegative(row.analyzedAt), "aiProfiles", index, "analyzedAt");
  });
  (normalized.recommendations ?? []).forEach((row, index) => {
    requireRow(isString(row.id) && row.id.length > 0, "recommendations", index, "id");
    requireRow(isSearchBook(row.book), "recommendations", index, "book");
    requireRow(isFiniteNumber(row.matchPercent) && row.matchPercent >= 0 && row.matchPercent <= 100, "recommendations", index, "matchPercent");
    requireRow(isString(row.reason), "recommendations", index, "reason");
    requireRow(isOptionalString(row.category), "recommendations", index, "category");
    requireRow(isNonNegative(row.generatedAt), "recommendations", index, "generatedAt");
    requireRow(
      isString(row.status) && VALID_RECOMMENDATION_STATUSES.has(row.status),
      "recommendations",
      index,
      "status",
    );
    requireRow(isOptionalString(row.feedbackReason), "recommendations", index, "feedbackReason");
  });
  (normalized.goals ?? []).forEach((row, index) => {
    requireRow(isFiniteNumber(row.year) && Number.isInteger(row.year), "goals", index, "year");
    requireRow(
      row.id === "current" || row.id === String(row.year),
      "goals",
      index,
      "id",
    );
    for (const field of ["targetBooks", "targetPages", "targetHours", "updatedAt"] as const) {
      requireRow(isNonNegative(row[field]), "goals", index, field);
    }
  });
  (normalized.wrapped ?? []).forEach((row, index) => {
    requireRow(isString(row.id) && row.id.length > 0, "wrapped", index, "id");
    requireRow(isString(row.summary), "wrapped", index, "summary");
    requireRow(isNonNegative(row.generatedAt), "wrapped", index, "generatedAt");
  });

  return normalized;
}

// 서버(Supabase)의 내 데이터를 로컬 내보내기와 같은 도메인 형태로 수집한다
// Collects the user's server data in the same domain shape as local exports
async function collectServerTables(): Promise<ExportPayload["tables"]> {
  const supabase = getSupabase();
  const currentYear = new Date().getFullYear();

  const select = async <T>(table: string): Promise<T[]> => {
    const { data, error } = await supabase.from(table).select("*");
    if (error) {
      throw new Error(`[export] ${table}: ${error.message}`);
    }
    return (data ?? []) as T[];
  };

  const [books, userBooks, sessions, recommendations, notes, quotes, preferences, aiProfiles, goals, wrapped] =
    await Promise.all([
      select<BookRow>("books"),
      select<UserBookRow>("user_books"),
      select<SessionRow>("reading_sessions"),
      select<RecommendationRow>("recommendations"),
      select<{ id: string; book_id: string; content: string; created_at: number }>("notes"),
      select<{
        id: string;
        book_id: string;
        page: number;
        quote: string;
        comment: string;
        created_at: number;
      }>("quotes"),
      select<{
        favorite_genres: string[];
        disliked_genres: string[];
        loved_books: PreferenceProfile["lovedBooks"];
        disliked_books: PreferenceProfile["dislikedBooks"];
        fiction_preference: PreferenceProfile["fictionPreference"];
        reading_purposes: string[];
        age_range: string | null;
        gender: string | null;
        updated_at: number;
      }>("preferences"),
      select<{
        profile_type: string;
        summary: string;
        genres: AiProfile["genres"];
        traits: string[];
        recommendation_factors: string[];
        evidence: string[];
        taste_changes: string[] | null;
        dna: AiProfile["dna"] | null;
        book_twin: AiProfile["bookTwin"] | null;
        analyzed_at: number;
      }>("ai_profiles"),
      select<{
        year: number;
        target_books: number;
        target_pages: number;
        target_hours: number;
        updated_at: number;
      }>("goals"),
      select<{ period: string; summary: string; generated_at: number }>("wrapped"),
    ]);

  return {
    books: books.map(rowToBook),
    userBooks: userBooks.map(rowToUserBook),
    readingSessions: sessions.map(rowToSession),
    recommendations: recommendations.map(rowToRecommendation),
    notes: notes.map(
      (row): BookNote => ({
        id: row.id,
        bookId: row.book_id,
        content: row.content,
        createdAt: row.created_at,
      }),
    ),
    quotes: quotes.map(
      (row): BookQuote => ({
        id: row.id,
        bookId: row.book_id,
        page: row.page,
        quote: row.quote,
        comment: row.comment,
        createdAt: row.created_at,
      }),
    ),
    preferences: preferences.map(
      (row): PreferenceProfile => ({
        id: "primary",
        favoriteGenres: row.favorite_genres,
        dislikedGenres: row.disliked_genres,
        lovedBooks: row.loved_books,
        dislikedBooks: row.disliked_books,
        fictionPreference: row.fiction_preference,
        readingPurposes: row.reading_purposes,
        ...(row.age_range !== null ? { ageRange: row.age_range } : {}),
        ...(row.gender !== null ? { gender: row.gender } : {}),
        updatedAt: row.updated_at,
      }),
    ),
    aiProfiles: aiProfiles.map(
      (row): AiProfile => ({
        id: "current",
        profileType: row.profile_type,
        summary: row.summary,
        genres: row.genres,
        traits: row.traits,
        recommendationFactors: row.recommendation_factors,
        evidence: row.evidence,
        ...(row.taste_changes !== null ? { tasteChanges: row.taste_changes } : {}),
        ...(row.dna !== null ? { dna: row.dna } : {}),
        ...(row.book_twin !== null ? { bookTwin: row.book_twin } : {}),
        analyzedAt: row.analyzed_at,
      }),
    ),
    // 서버는 연도별 다중 행 — 올해 행만 "current"로, 과거 연도는 연도 문자열 id로 보존한다
    // Server keeps one row per year — this year maps to "current", past years keep year ids
    goals: goals.map(
      (row): ReadingGoals => ({
        id: row.year === currentYear ? "current" : (String(row.year) as ReadingGoals["id"]),
        year: row.year,
        targetBooks: row.target_books,
        targetPages: row.target_pages,
        targetHours: row.target_hours,
        updatedAt: row.updated_at,
      }),
    ),
    wrapped: wrapped.map(
      (row): WrappedSummary => ({
        id: row.period,
        summary: row.summary,
        generatedAt: row.generated_at,
      }),
    ),
  };
}

export async function exportAllData(): Promise<void> {
  let tables: ExportPayload["tables"];
  if (isServerMode()) {
    tables = await collectServerTables();
  } else {
    const db = getDb();
    tables = {};
    for (const name of TABLE_NAMES) {
      tables[name] = await db.table(name).toArray();
    }
  }
  const payload: ExportPayload = {
    app: "rive",
    version: EXPORT_VERSION,
    exportedAt: Date.now(),
    tables,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `rive-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export interface ImportResult {
  imported: number;
}

export async function importAllData(file: File): Promise<ImportResult> {
  const text = await file.text();
  const payload = parseBackupPayload(text);

  // 서버 모드는 계정으로 병합 복원 — 이관과 같은 업로더를 재사용한다 (RLS 보호)
  // Server mode merges into the account via the shared uploader (RLS-scoped)
  if (isServerMode()) {
    // Existing server-book ids are resolved inside uploadDomainTables after its RLS-scoped preload.
    const validated = validateImportTables(payload.tables, new Set(), false);
    const result = await uploadDomainTables(validated as unknown as DomainTables);
    notifyLibraryChange();
    return { imported: result.imported };
  }

  const db = getDb();
  const existingBookIds = new Set((await db.books.toArray()).map((book) => book.id));
  const validated = validateImportTables(payload.tables, existingBookIds);
  let imported = 0;
  await db.transaction("rw", TABLE_NAMES.map((name) => db.table(name)), async () => {
    for (const name of TABLE_NAMES) {
      const rows = validated[name];
      if (!rows || rows.length === 0) continue;
      await db.table(name).bulkPut(rows);
      imported += rows.length;
    }
  });

  notifyLibraryChange();
  return { imported };
}
