import type {
  ActiveSession,
  AiProfile,
  AiRecommendation,
  Book,
  BookNote,
  BookQuote,
  BookStatus,
  PreferenceProfile,
  ReadingGoals,
  ReadingSession,
  RecommendationStatus,
  UserBook,
  WrappedSummary,
} from "@/lib/types";

// 저장소 인터페이스 — Supabase 전환 시 이 경계만 교체한다
// Repository interface — the only boundary to swap when moving to Supabase
export interface ReadingRepository {
  upsertBookByIsbn(book: Omit<Book, "id" | "createdAt">): Promise<Book>;
  getBook(bookId: string): Promise<Book | undefined>;
  updateBookMeta(
    bookId: string,
    patch: Partial<Pick<Book, "pageCount" | "description" | "categories" | "enrichedAt">>,
  ): Promise<void>;

  getUserBook(bookId: string): Promise<UserBook | undefined>;
  listUserBooks(): Promise<UserBook[]>;
  listUserBooksByStatus(status: BookStatus): Promise<UserBook[]>;
  setBookStatus(bookId: string, status: BookStatus): Promise<void>;
  updateUserBook(bookId: string, patch: Partial<Omit<UserBook, "bookId">>): Promise<void>;
  touchLastRead(bookId: string, currentPage: number, timestamp: number): Promise<void>;

  addSession(session: Omit<ReadingSession, "id" | "createdAt">): Promise<ReadingSession>;
  // 오입력 정정 수단 — 세션 수정/삭제와 책 완전 제거 (BACKLOG P0-B)
  // Correction tools — session edit/delete and full book removal (BACKLOG P0-B)
  updateSession(
    id: string,
    patch: Partial<Omit<ReadingSession, "id" | "bookId" | "createdAt">>,
  ): Promise<void>;
  deleteSession(id: string): Promise<void>;
  removeBookCompletely(bookId: string): Promise<void>;
  listSessionsByDateRange(startMs: number, endMs: number): Promise<ReadingSession[]>;
  listSessionsForBook(bookId: string): Promise<ReadingSession[]>;
  listAllSessions(): Promise<ReadingSession[]>;

  getActiveSession(): Promise<ActiveSession | undefined>;
  startActiveSession(bookId: string, startPage: number, startedAt: number): Promise<void>;
  clearActiveSession(): Promise<void>;

  // AI 취향 분석/추천 캐시 (스펙 §65)
  // AI preference/recommendation cache (spec §65)
  getPreferenceProfile(): Promise<PreferenceProfile | undefined>;
  savePreferenceProfile(profile: Omit<PreferenceProfile, "id">): Promise<void>;
  getAiProfile(): Promise<AiProfile | undefined>;
  saveAiProfile(profile: Omit<AiProfile, "id">): Promise<void>;
  listRecommendations(): Promise<AiRecommendation[]>;
  replaceActiveRecommendations(items: AiRecommendation[]): Promise<void>;
  updateRecommendation(
    id: string,
    patch: { status: RecommendationStatus; feedbackReason?: string },
  ): Promise<void>;

  // 노트/인용구 (스펙 §27)
  // Notes/quotes (spec §27)
  addNote(note: Omit<BookNote, "id" | "createdAt">): Promise<BookNote>;
  listNotesForBook(bookId: string): Promise<BookNote[]>;
  deleteNote(id: string): Promise<void>;
  addQuote(quote: Omit<BookQuote, "id" | "createdAt">): Promise<BookQuote>;
  listQuotesForBook(bookId: string): Promise<BookQuote[]>;
  deleteQuote(id: string): Promise<void>;

  // 연간 목표 (스펙 §36)
  // Annual goals (spec §36)
  getGoals(): Promise<ReadingGoals | undefined>;
  saveGoals(goals: Omit<ReadingGoals, "id">): Promise<void>;

  // 리캡 AI 요약 캐시 (스펙 §58, §65)
  // Wrapped AI-summary cache (spec §58, §65)
  getWrapped(id: string): Promise<WrappedSummary | undefined>;
  saveWrapped(entry: WrappedSummary): Promise<void>;
}
