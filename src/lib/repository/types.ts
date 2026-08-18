import type {
  ActiveSession,
  AiProfile,
  AiRecommendation,
  Book,
  BookStatus,
  PreferenceProfile,
  ReadingSession,
  RecommendationStatus,
  UserBook,
} from "@/lib/types";

// 저장소 인터페이스 — Supabase 전환 시 이 경계만 교체한다
// Repository interface — the only boundary to swap when moving to Supabase
export interface ReadingRepository {
  upsertBookByIsbn(book: Omit<Book, "id" | "createdAt">): Promise<Book>;
  getBook(bookId: string): Promise<Book | undefined>;

  getUserBook(bookId: string): Promise<UserBook | undefined>;
  listUserBooks(): Promise<UserBook[]>;
  listUserBooksByStatus(status: BookStatus): Promise<UserBook[]>;
  setBookStatus(bookId: string, status: BookStatus): Promise<void>;
  updateUserBook(bookId: string, patch: Partial<Omit<UserBook, "bookId">>): Promise<void>;
  touchLastRead(bookId: string, currentPage: number, timestamp: number): Promise<void>;

  addSession(session: Omit<ReadingSession, "id" | "createdAt">): Promise<ReadingSession>;
  listSessionsByDateRange(startMs: number, endMs: number): Promise<ReadingSession[]>;
  listSessionsForBook(bookId: string): Promise<ReadingSession[]>;
  listAllSessions(): Promise<ReadingSession[]>;
  getLastSessionForBook(bookId: string): Promise<ReadingSession | undefined>;

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
}
