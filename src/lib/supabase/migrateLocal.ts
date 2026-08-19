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

// 도메인 테이블을 Supabase에 참조 순서대로 upsert한다 (RLS가 본인 행만 허용)
// Upserts domain tables to Supabase in reference order (RLS scopes to the owner)
export async function uploadDomainTables(tables: DomainTables): Promise<{ imported: number }> {
  const supabase = getSupabase();
  let imported = 0;

  const fail = (context: string, message: string): never => {
    throw new Error(`[migrate] ${context}: ${message}`);
  };

  const books = tables.books ?? [];
  if (books.length > 0) {
    const { error } = await supabase.from("books").upsert(
      books.map((book) => ({
        id: book.id,
        title: book.title,
        authors: book.authors,
        publisher: book.publisher,
        isbn13: book.isbn13,
        cover_url: book.coverUrl,
        page_count: book.pageCount,
        kakao_url: book.kakaoUrl,
        google_books_id: book.googleBooksId,
        created_at: book.createdAt,
        description: book.description ?? null,
        categories: book.categories ?? null,
        enriched_at: book.enrichedAt ?? null,
      })),
      { onConflict: "id" },
    );
    if (error) fail("books", error.message);
    imported += books.length;
  }

  const userBooks = tables.userBooks ?? [];
  if (userBooks.length > 0) {
    const { error } = await supabase.from("user_books").upsert(
      userBooks.map((userBook) => ({
        book_id: userBook.bookId,
        status: userBook.status,
        current_page: userBook.currentPage,
        started_at: userBook.startedAt,
        finished_at: userBook.finishedAt,
        created_at: userBook.createdAt,
        last_read_at: userBook.lastReadAt,
        rating: userBook.rating ?? null,
        dnf_reason: userBook.dnfReason ?? null,
        extra_ratings: userBook.extraRatings ?? null,
        up_next_at: userBook.upNextAt ?? null,
        target_date: userBook.targetDate ?? null,
      })),
      { onConflict: "user_id,book_id" },
    );
    if (error) fail("user_books", error.message);
    imported += userBooks.length;
  }

  const sessions = tables.readingSessions ?? [];
  if (sessions.length > 0) {
    const { error } = await supabase.from("reading_sessions").upsert(
      sessions.map((session) => ({
        id: session.id,
        book_id: session.bookId,
        started_at: session.startedAt,
        ended_at: session.endedAt,
        duration_seconds: session.durationSeconds,
        start_page: session.startPage,
        end_page: session.endPage,
        pages_read: session.pagesRead,
        memo: session.memo,
        created_at: session.createdAt,
      })),
      { onConflict: "id" },
    );
    if (error) fail("reading_sessions", error.message);
    imported += sessions.length;
  }

  const notes = tables.notes ?? [];
  if (notes.length > 0) {
    const { error } = await supabase.from("notes").upsert(
      notes.map((note) => ({
        id: note.id,
        book_id: note.bookId,
        content: note.content,
        created_at: note.createdAt,
      })),
      { onConflict: "id" },
    );
    if (error) fail("notes", error.message);
    imported += notes.length;
  }

  const quotes = tables.quotes ?? [];
  if (quotes.length > 0) {
    const { error } = await supabase.from("quotes").upsert(
      quotes.map((quote) => ({
        id: quote.id,
        book_id: quote.bookId,
        page: quote.page,
        quote: quote.quote,
        comment: quote.comment,
        created_at: quote.createdAt,
      })),
      { onConflict: "id" },
    );
    if (error) fail("quotes", error.message);
    imported += quotes.length;
  }

  const preferences = tables.preferences ?? [];
  if (preferences.length > 0) {
    const profile = preferences[0];
    const { error } = await supabase.from("preferences").upsert(
      {
        favorite_genres: profile.favoriteGenres,
        disliked_genres: profile.dislikedGenres,
        loved_books: profile.lovedBooks,
        disliked_books: profile.dislikedBooks,
        fiction_preference: profile.fictionPreference,
        reading_purposes: profile.readingPurposes,
        age_range: profile.ageRange ?? null,
        gender: profile.gender ?? null,
        updated_at: profile.updatedAt,
      },
      { onConflict: "user_id" },
    );
    if (error) fail("preferences", error.message);
    imported += 1;
  }

  const aiProfiles = tables.aiProfiles ?? [];
  if (aiProfiles.length > 0) {
    const profile = aiProfiles[0];
    const { error } = await supabase.from("ai_profiles").upsert(
      {
        profile_type: profile.profileType,
        summary: profile.summary,
        genres: profile.genres,
        traits: profile.traits,
        recommendation_factors: profile.recommendationFactors,
        evidence: profile.evidence,
        taste_changes: profile.tasteChanges ?? null,
        dna: profile.dna ?? null,
        book_twin: profile.bookTwin ?? null,
        analyzed_at: profile.analyzedAt,
      },
      { onConflict: "user_id" },
    );
    if (error) fail("ai_profiles", error.message);
    imported += 1;
  }

  const recommendations = tables.recommendations ?? [];
  if (recommendations.length > 0) {
    const { error } = await supabase.from("recommendations").upsert(
      recommendations.map((item) => ({
        id: item.id,
        book: item.book,
        match_percent: item.matchPercent,
        reason: item.reason,
        category: item.category ?? null,
        generated_at: item.generatedAt,
        status: item.status,
        feedback_reason: item.feedbackReason ?? null,
      })),
      { onConflict: "id" },
    );
    if (error) fail("recommendations", error.message);
    imported += recommendations.length;
  }

  const goals = tables.goals ?? [];
  if (goals.length > 0) {
    const { error } = await supabase.from("goals").upsert(
      goals.map((goal) => ({
        year: goal.year,
        target_books: goal.targetBooks,
        target_pages: goal.targetPages,
        target_hours: goal.targetHours,
        updated_at: goal.updatedAt,
      })),
      { onConflict: "user_id,year" },
    );
    if (error) fail("goals", error.message);
    imported += goals.length;
  }

  const wrapped = tables.wrapped ?? [];
  if (wrapped.length > 0) {
    const { error } = await supabase.from("wrapped").upsert(
      wrapped.map((entry) => ({
        period: entry.id,
        summary: entry.summary,
        generated_at: entry.generatedAt,
      })),
      { onConflict: "user_id,period" },
    );
    if (error) fail("wrapped", error.message);
    imported += wrapped.length;
  }

  return { imported };
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
