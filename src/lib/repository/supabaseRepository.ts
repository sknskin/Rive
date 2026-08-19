import type {
  ActiveSession,
  AiProfile,
  AiRecommendation,
  Book,
  BookNote,
  BookQuote,
  BookSearchResult,
  BookStatus,
  PreferenceProfile,
  ReadingGoals,
  ReadingSession,
  RecommendationStatus,
  UserBook,
} from "@/lib/types";
import type { WrappedSummary } from "@/lib/types";
import { ACTIVE_SESSION_ID, AI_PROFILE_ID, PREFERENCE_PROFILE_ID } from "@/lib/constants";
import { getSupabase } from "@/lib/supabase/client";
import type { ReadingRepository } from "./types";

// Postgres unique 제약 위반 코드 — upsert 경합 시 재조회 폴백에 사용
// Postgres unique-violation code — used for the upsert race fallback
const UNIQUE_VIOLATION = "23505";

// ── row 타입과 매퍼 — DB snake_case ↔ 도메인 camelCase ────────────────
// Row types and mappers — DB snake_case ↔ domain camelCase

export interface BookRow {
  id: string;
  title: string;
  authors: string[];
  publisher: string;
  isbn13: string;
  cover_url: string;
  page_count: number;
  kakao_url: string;
  google_books_id: string;
  created_at: number;
  description: string | null;
  categories: string[] | null;
  enriched_at: number | null;
}

export function rowToBook(row: BookRow): Book {
  return {
    id: row.id,
    title: row.title,
    authors: row.authors,
    publisher: row.publisher,
    isbn13: row.isbn13,
    coverUrl: row.cover_url,
    pageCount: row.page_count,
    kakaoUrl: row.kakao_url,
    googleBooksId: row.google_books_id,
    createdAt: row.created_at,
    ...(row.description !== null ? { description: row.description } : {}),
    ...(row.categories !== null ? { categories: row.categories } : {}),
    ...(row.enriched_at !== null ? { enrichedAt: row.enriched_at } : {}),
  };
}

export interface UserBookRow {
  book_id: string;
  status: BookStatus;
  current_page: number;
  started_at: number | null;
  finished_at: number | null;
  created_at: number;
  last_read_at: number;
  rating: number | null;
  dnf_reason: string | null;
  extra_ratings: UserBook["extraRatings"] | null;
  up_next_at: number | null;
  target_date: number | null;
}

export function rowToUserBook(row: UserBookRow): UserBook {
  return {
    bookId: row.book_id,
    status: row.status,
    currentPage: row.current_page,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
    lastReadAt: row.last_read_at,
    ...(row.rating !== null ? { rating: row.rating } : {}),
    ...(row.dnf_reason !== null ? { dnfReason: row.dnf_reason } : {}),
    ...(row.extra_ratings !== null ? { extraRatings: row.extra_ratings } : {}),
    ...(row.up_next_at !== null ? { upNextAt: row.up_next_at } : {}),
    ...(row.target_date !== null ? { targetDate: row.target_date } : {}),
  };
}

// UserBook patch의 camelCase 키를 snake_case 컬럼으로 옮긴다.
// undefined는 "값 지우기" 의도(Dexie와 동일)이므로 null로 변환해 컬럼을 비운다.
// Maps UserBook patch keys to columns; explicit undefined means "clear"
// (matching Dexie semantics), so it becomes SQL null.
const USER_BOOK_COLUMNS: Record<string, string> = {
  status: "status",
  currentPage: "current_page",
  startedAt: "started_at",
  finishedAt: "finished_at",
  createdAt: "created_at",
  lastReadAt: "last_read_at",
  rating: "rating",
  dnfReason: "dnf_reason",
  extraRatings: "extra_ratings",
  upNextAt: "up_next_at",
  targetDate: "target_date",
};

function userBookPatchToRow(patch: Partial<Omit<UserBook, "bookId">>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    const column = USER_BOOK_COLUMNS[key];
    if (column) {
      row[column] = value === undefined ? null : value;
    }
  }
  return row;
}

export interface SessionRow {
  id: string;
  book_id: string;
  started_at: number;
  ended_at: number;
  duration_seconds: number;
  start_page: number;
  end_page: number;
  pages_read: number;
  memo: string;
  created_at: number;
}

export function rowToSession(row: SessionRow): ReadingSession {
  return {
    id: row.id,
    bookId: row.book_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds,
    startPage: row.start_page,
    endPage: row.end_page,
    pagesRead: row.pages_read,
    memo: row.memo,
    createdAt: row.created_at,
  };
}

const SESSION_COLUMNS: Record<string, string> = {
  startedAt: "started_at",
  endedAt: "ended_at",
  durationSeconds: "duration_seconds",
  startPage: "start_page",
  endPage: "end_page",
  pagesRead: "pages_read",
  memo: "memo",
};

export interface RecommendationRow {
  id: string;
  book: BookSearchResult;
  match_percent: number;
  reason: string;
  category: string | null;
  generated_at: number;
  status: RecommendationStatus;
  feedback_reason: string | null;
}

export function rowToRecommendation(row: RecommendationRow): AiRecommendation {
  return {
    id: row.id,
    book: row.book,
    matchPercent: row.match_percent,
    reason: row.reason,
    ...(row.category !== null ? { category: row.category } : {}),
    generatedAt: row.generated_at,
    status: row.status,
    ...(row.feedback_reason !== null ? { feedbackReason: row.feedback_reason } : {}),
  };
}

// supabase-js 응답의 error를 예외로 승격한다 — 빈 catch 금지 원칙과 짝
// Promotes supabase-js response errors to exceptions
function unwrap<T>(result: { data: T; error: { message: string } | null }, context: string): T {
  if (result.error) {
    throw new Error(`[supabase] ${context}: ${result.error.message}`);
  }
  return result.data;
}

// Supabase 기반 저장소 — 로그인 사용자의 데이터를 서버(RLS 보호)에 기록한다
// Supabase-backed repository — persists signed-in users' data behind RLS
export class SupabaseRepository implements ReadingRepository {
  private get client() {
    return getSupabase();
  }

  async upsertBookByIsbn(book: Omit<Book, "id" | "createdAt">): Promise<Book> {
    // isbn13이 있으면 기존 레코드 재사용 — 서버 unique 인덱스가 경합도 막아준다
    // Reuse the existing record by isbn13; the unique index also guards races
    if (book.isbn13) {
      const existing = await this.client
        .from("books")
        .select("*")
        .eq("isbn13", book.isbn13)
        .maybeSingle();
      const found = unwrap(existing, "books select by isbn") as BookRow | null;
      if (found) {
        return rowToBook(found);
      }
    } else {
      const byTitle = await this.client.from("books").select("*").eq("title", book.title);
      const rows = unwrap(byTitle, "books select by title") as BookRow[];
      const matched = rows.find(
        (row) => row.authors.join(",") === book.authors.join(","),
      );
      if (matched) {
        return rowToBook(matched);
      }
    }

    const created: Book = { ...book, id: crypto.randomUUID(), createdAt: Date.now() };
    const inserted = await this.client.from("books").insert({
      id: created.id,
      title: created.title,
      authors: created.authors,
      publisher: created.publisher,
      isbn13: created.isbn13,
      cover_url: created.coverUrl,
      page_count: created.pageCount,
      kakao_url: created.kakaoUrl,
      google_books_id: created.googleBooksId,
      created_at: created.createdAt,
      description: created.description ?? null,
      categories: created.categories ?? null,
      enriched_at: created.enrichedAt ?? null,
    });
    if (inserted.error) {
      // 동시 등록 경합 — unique 위반이면 방금 들어간 행을 재조회한다
      // Insert race — on unique violation, re-read the winning row
      if (inserted.error.code === UNIQUE_VIOLATION && book.isbn13) {
        const retry = await this.client
          .from("books")
          .select("*")
          .eq("isbn13", book.isbn13)
          .maybeSingle();
        const winner = unwrap(retry, "books re-select after race") as BookRow | null;
        if (winner) {
          return rowToBook(winner);
        }
      }
      throw new Error(`[supabase] books insert: ${inserted.error.message}`);
    }
    return created;
  }

  async listBooksByIds(bookIds: string[]): Promise<Map<string, Book>> {
    const uniqueIds = [...new Set(bookIds)];
    const byId = new Map<string, Book>();
    if (uniqueIds.length === 0) {
      return byId;
    }
    const result = await this.client.from("books").select("*").in("id", uniqueIds);
    const rows = unwrap(result, "books select by ids") as BookRow[];
    rows.forEach((row) => byId.set(row.id, rowToBook(row)));
    return byId;
  }

  async getBook(bookId: string): Promise<Book | undefined> {
    const result = await this.client.from("books").select("*").eq("id", bookId).maybeSingle();
    const row = unwrap(result, "books select") as BookRow | null;
    return row ? rowToBook(row) : undefined;
  }

  async updateBookMeta(
    bookId: string,
    patch: Partial<Pick<Book, "pageCount" | "description" | "categories" | "enrichedAt">>,
  ): Promise<void> {
    const row: Record<string, unknown> = {};
    if (patch.pageCount !== undefined) row.page_count = patch.pageCount;
    if (patch.description !== undefined) row.description = patch.description;
    if (patch.categories !== undefined) row.categories = patch.categories;
    if (patch.enrichedAt !== undefined) row.enriched_at = patch.enrichedAt;
    const result = await this.client.from("books").update(row).eq("id", bookId).select("id");
    const updated = unwrap(result, "books update meta") as { id: string }[];
    if (updated.length === 0) {
      throw new Error(`book not found: ${bookId}`);
    }
  }

  async getUserBook(bookId: string): Promise<UserBook | undefined> {
    const result = await this.client
      .from("user_books")
      .select("*")
      .eq("book_id", bookId)
      .maybeSingle();
    const row = unwrap(result, "user_books select") as UserBookRow | null;
    return row ? rowToUserBook(row) : undefined;
  }

  async listUserBooks(): Promise<UserBook[]> {
    const result = await this.client
      .from("user_books")
      .select("*")
      .order("last_read_at", { ascending: false });
    return (unwrap(result, "user_books list") as UserBookRow[]).map(rowToUserBook);
  }

  async listUserBooksByStatus(status: BookStatus): Promise<UserBook[]> {
    const result = await this.client
      .from("user_books")
      .select("*")
      .eq("status", status)
      .order("last_read_at", { ascending: false });
    return (unwrap(result, "user_books list by status") as UserBookRow[]).map(rowToUserBook);
  }

  async updateUserBook(bookId: string, patch: Partial<Omit<UserBook, "bookId">>): Promise<void> {
    const result = await this.client
      .from("user_books")
      .update(userBookPatchToRow(patch))
      .eq("book_id", bookId)
      .select("book_id");
    const updated = unwrap(result, "user_books update") as { book_id: string }[];
    if (updated.length === 0) {
      throw new Error(`userBook not found: ${bookId}`);
    }
  }

  async setBookStatus(bookId: string, status: BookStatus): Promise<void> {
    const now = Date.now();
    const existing = await this.getUserBook(bookId);

    if (existing) {
      const patch: Partial<UserBook> = { status };
      if (status === "reading" && existing.startedAt === null) {
        patch.startedAt = now;
      }
      if (status === "read") {
        patch.finishedAt = now;
      }
      await this.updateUserBook(bookId, patch);
      return;
    }

    const result = await this.client.from("user_books").insert({
      book_id: bookId,
      status,
      current_page: 0,
      started_at: status === "reading" ? now : null,
      finished_at: status === "read" ? now : null,
      created_at: now,
      last_read_at: now,
    });
    unwrap({ data: null, error: result.error }, "user_books insert");
  }

  async touchLastRead(bookId: string, currentPage: number, timestamp: number): Promise<void> {
    await this.updateUserBook(bookId, { currentPage, lastReadAt: timestamp });
  }

  async addSession(session: Omit<ReadingSession, "id" | "createdAt">): Promise<ReadingSession> {
    const created: ReadingSession = { ...session, id: crypto.randomUUID(), createdAt: Date.now() };
    const result = await this.client.from("reading_sessions").insert({
      id: created.id,
      book_id: created.bookId,
      started_at: created.startedAt,
      ended_at: created.endedAt,
      duration_seconds: created.durationSeconds,
      start_page: created.startPage,
      end_page: created.endPage,
      pages_read: created.pagesRead,
      memo: created.memo,
      created_at: created.createdAt,
    });
    unwrap({ data: null, error: result.error }, "reading_sessions insert");
    return created;
  }

  async updateSession(
    id: string,
    patch: Partial<Omit<ReadingSession, "id" | "bookId" | "createdAt">>,
  ): Promise<void> {
    const row: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      const column = SESSION_COLUMNS[key];
      if (column) {
        row[column] = value === undefined ? null : value;
      }
    }
    const result = await this.client
      .from("reading_sessions")
      .update(row)
      .eq("id", id)
      .select("id");
    const updated = unwrap(result, "reading_sessions update") as { id: string }[];
    if (updated.length === 0) {
      throw new Error(`session not found: ${id}`);
    }
  }

  async deleteSession(id: string): Promise<void> {
    const result = await this.client.from("reading_sessions").delete().eq("id", id);
    unwrap({ data: null, error: result.error }, "reading_sessions delete");
  }

  async removeBookCompletely(bookId: string): Promise<void> {
    // 스키마의 복합 FK on delete cascade가 서재/세션/노트/인용구/활성 세션을 함께 지운다
    // Composite-FK cascades clean shelf/sessions/notes/quotes/active session together
    const result = await this.client.from("books").delete().eq("id", bookId);
    unwrap({ data: null, error: result.error }, "books delete");
  }

  async listSessionsByDateRange(startMs: number, endMs: number): Promise<ReadingSession[]> {
    const result = await this.client
      .from("reading_sessions")
      .select("*")
      .gte("started_at", startMs)
      .lt("started_at", endMs)
      .order("started_at", { ascending: true });
    return (unwrap(result, "reading_sessions range") as SessionRow[]).map(rowToSession);
  }

  async listSessionsForBook(bookId: string): Promise<ReadingSession[]> {
    const result = await this.client
      .from("reading_sessions")
      .select("*")
      .eq("book_id", bookId)
      .order("started_at", { ascending: true });
    return (unwrap(result, "reading_sessions for book") as SessionRow[]).map(rowToSession);
  }

  async listAllSessions(): Promise<ReadingSession[]> {
    const result = await this.client
      .from("reading_sessions")
      .select("*")
      .order("started_at", { ascending: true });
    return (unwrap(result, "reading_sessions all") as SessionRow[]).map(rowToSession);
  }

  async getActiveSession(): Promise<ActiveSession | undefined> {
    const result = await this.client.from("active_sessions").select("*").maybeSingle();
    const row = unwrap(result, "active_sessions select") as {
      book_id: string;
      started_at: number;
      start_page: number;
    } | null;
    if (!row) {
      return undefined;
    }
    return {
      id: ACTIVE_SESSION_ID,
      bookId: row.book_id,
      startedAt: row.started_at,
      startPage: row.start_page,
    };
  }

  async startActiveSession(bookId: string, startPage: number, startedAt: number): Promise<void> {
    const result = await this.client
      .from("active_sessions")
      .upsert(
        { book_id: bookId, start_page: startPage, started_at: startedAt },
        { onConflict: "user_id" },
      );
    unwrap({ data: null, error: result.error }, "active_sessions upsert");
  }

  async clearActiveSession(): Promise<void> {
    // RLS로 본인 행만 보이므로 조건 없는 delete가 곧 "내 활성 세션 삭제"다
    // RLS scopes rows to the owner, so an unfiltered delete clears only ours
    const result = await this.client.from("active_sessions").delete().gte("started_at", 0);
    unwrap({ data: null, error: result.error }, "active_sessions delete");
  }

  async getPreferenceProfile(): Promise<PreferenceProfile | undefined> {
    const result = await this.client.from("preferences").select("*").maybeSingle();
    const row = unwrap(result, "preferences select") as {
      favorite_genres: string[];
      disliked_genres: string[];
      loved_books: PreferenceProfile["lovedBooks"];
      disliked_books: PreferenceProfile["dislikedBooks"];
      fiction_preference: PreferenceProfile["fictionPreference"];
      reading_purposes: string[];
      age_range: string | null;
      gender: string | null;
      updated_at: number;
    } | null;
    if (!row) {
      return undefined;
    }
    return {
      id: PREFERENCE_PROFILE_ID,
      favoriteGenres: row.favorite_genres,
      dislikedGenres: row.disliked_genres,
      lovedBooks: row.loved_books,
      dislikedBooks: row.disliked_books,
      fictionPreference: row.fiction_preference,
      readingPurposes: row.reading_purposes,
      ...(row.age_range !== null ? { ageRange: row.age_range } : {}),
      ...(row.gender !== null ? { gender: row.gender } : {}),
      updatedAt: row.updated_at,
    };
  }

  async savePreferenceProfile(profile: Omit<PreferenceProfile, "id">): Promise<void> {
    const result = await this.client.from("preferences").upsert(
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
    unwrap({ data: null, error: result.error }, "preferences upsert");
  }

  async getAiProfile(): Promise<AiProfile | undefined> {
    const result = await this.client.from("ai_profiles").select("*").maybeSingle();
    const row = unwrap(result, "ai_profiles select") as {
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
    } | null;
    if (!row) {
      return undefined;
    }
    return {
      id: AI_PROFILE_ID,
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
    };
  }

  async saveAiProfile(profile: Omit<AiProfile, "id">): Promise<void> {
    const result = await this.client.from("ai_profiles").upsert(
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
    unwrap({ data: null, error: result.error }, "ai_profiles upsert");
  }

  async listRecommendations(): Promise<AiRecommendation[]> {
    const result = await this.client
      .from("recommendations")
      .select("*")
      .order("match_percent", { ascending: false });
    return (unwrap(result, "recommendations list") as RecommendationRow[]).map(
      rowToRecommendation,
    );
  }

  async replaceActiveRecommendations(items: AiRecommendation[]): Promise<void> {
    // active 삭제 + 삽입을 원자적으로 — plpgsql RPC가 Dexie 트랜잭션을 대체한다 (6차 C5)
    // Atomic delete-and-insert via the plpgsql RPC replacing the Dexie transaction
    const result = await this.client.rpc("replace_active_recommendations", {
      p_items: items,
    });
    unwrap({ data: null, error: result.error }, "replace_active_recommendations rpc");
  }

  async updateRecommendation(
    id: string,
    patch: { status: RecommendationStatus; feedbackReason?: string },
  ): Promise<void> {
    const result = await this.client
      .from("recommendations")
      .update({
        status: patch.status,
        ...(patch.feedbackReason !== undefined ? { feedback_reason: patch.feedbackReason } : {}),
      })
      .eq("id", id)
      .select("id");
    const updated = unwrap(result, "recommendations update") as { id: string }[];
    if (updated.length === 0) {
      throw new Error(`recommendation not found: ${id}`);
    }
  }

  async addNote(note: Omit<BookNote, "id" | "createdAt">): Promise<BookNote> {
    const created: BookNote = { ...note, id: crypto.randomUUID(), createdAt: Date.now() };
    const result = await this.client.from("notes").insert({
      id: created.id,
      book_id: created.bookId,
      content: created.content,
      created_at: created.createdAt,
    });
    unwrap({ data: null, error: result.error }, "notes insert");
    return created;
  }

  async listNotesForBook(bookId: string): Promise<BookNote[]> {
    const result = await this.client
      .from("notes")
      .select("*")
      .eq("book_id", bookId)
      .order("created_at", { ascending: false });
    const rows = unwrap(result, "notes list") as {
      id: string;
      book_id: string;
      content: string;
      created_at: number;
    }[];
    return rows.map((row) => ({
      id: row.id,
      bookId: row.book_id,
      content: row.content,
      createdAt: row.created_at,
    }));
  }

  async deleteNote(id: string): Promise<void> {
    const result = await this.client.from("notes").delete().eq("id", id);
    unwrap({ data: null, error: result.error }, "notes delete");
  }

  async addQuote(quote: Omit<BookQuote, "id" | "createdAt">): Promise<BookQuote> {
    const created: BookQuote = { ...quote, id: crypto.randomUUID(), createdAt: Date.now() };
    const result = await this.client.from("quotes").insert({
      id: created.id,
      book_id: created.bookId,
      page: created.page,
      quote: created.quote,
      comment: created.comment,
      created_at: created.createdAt,
    });
    unwrap({ data: null, error: result.error }, "quotes insert");
    return created;
  }

  async listQuotesForBook(bookId: string): Promise<BookQuote[]> {
    const result = await this.client
      .from("quotes")
      .select("*")
      .eq("book_id", bookId)
      .order("created_at", { ascending: false });
    const rows = unwrap(result, "quotes list") as {
      id: string;
      book_id: string;
      page: number;
      quote: string;
      comment: string;
      created_at: number;
    }[];
    return rows.map((row) => ({
      id: row.id,
      bookId: row.book_id,
      page: row.page,
      quote: row.quote,
      comment: row.comment,
      createdAt: row.created_at,
    }));
  }

  async deleteQuote(id: string): Promise<void> {
    const result = await this.client.from("quotes").delete().eq("id", id);
    unwrap({ data: null, error: result.error }, "quotes delete");
  }

  async getGoals(): Promise<ReadingGoals | undefined> {
    // 서버는 (user_id, year) 복합키 — 인터페이스 호환을 위해 올해 행을 "current"로 노출
    // Server keys goals by (user_id, year); expose this year's row as "current"
    const year = new Date().getFullYear();
    const result = await this.client.from("goals").select("*").eq("year", year).maybeSingle();
    const row = unwrap(result, "goals select") as {
      year: number;
      target_books: number;
      target_pages: number;
      target_hours: number;
      updated_at: number;
    } | null;
    if (!row) {
      return undefined;
    }
    return {
      id: "current",
      year: row.year,
      targetBooks: row.target_books,
      targetPages: row.target_pages,
      targetHours: row.target_hours,
      updatedAt: row.updated_at,
    };
  }

  async saveGoals(goals: Omit<ReadingGoals, "id">): Promise<void> {
    const result = await this.client.from("goals").upsert(
      {
        year: goals.year,
        target_books: goals.targetBooks,
        target_pages: goals.targetPages,
        target_hours: goals.targetHours,
        updated_at: goals.updatedAt,
      },
      { onConflict: "user_id,year" },
    );
    unwrap({ data: null, error: result.error }, "goals upsert");
  }

  async getWrapped(id: string): Promise<WrappedSummary | undefined> {
    const result = await this.client.from("wrapped").select("*").eq("period", id).maybeSingle();
    const row = unwrap(result, "wrapped select") as {
      period: string;
      summary: string;
      generated_at: number;
    } | null;
    if (!row) {
      return undefined;
    }
    return { id: row.period, summary: row.summary, generatedAt: row.generated_at };
  }

  async saveWrapped(entry: WrappedSummary): Promise<void> {
    const result = await this.client.from("wrapped").upsert(
      { period: entry.id, summary: entry.summary, generated_at: entry.generatedAt },
      { onConflict: "user_id,period" },
    );
    unwrap({ data: null, error: result.error }, "wrapped upsert");
  }
}
