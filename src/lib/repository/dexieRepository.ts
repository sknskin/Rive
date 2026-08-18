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
import { ACTIVE_SESSION_ID, AI_PROFILE_ID, PREFERENCE_PROFILE_ID } from "@/lib/constants";
import { getDb } from "@/lib/db";
import type { ReadingRepository } from "./types";

// Dexie 기반 저장소 구현 — 브라우저 IndexedDB에 기록한다
// Dexie-backed repository — persists to browser IndexedDB
export class DexieRepository implements ReadingRepository {
  private get db() {
    return getDb();
  }

  async upsertBookByIsbn(book: Omit<Book, "id" | "createdAt">): Promise<Book> {
    // isbn13이 있으면 기존 레코드를 재사용해 중복 등록을 막는다
    // Reuse the existing record when isbn13 matches to avoid duplicates
    if (book.isbn13) {
      const existing = await this.db.books.where("isbn13").equals(book.isbn13).first();
      if (existing) {
        return existing;
      }
    }

    // isbn이 없으면 제목+저자 조합으로 매칭을 시도한다
    // Without an isbn, try matching by title + authors
    const byTitle = await this.db.books
      .filter(
        (candidate) =>
          candidate.title === book.title &&
          candidate.authors.join(",") === book.authors.join(","),
      )
      .first();
    if (byTitle) {
      return byTitle;
    }

    const created: Book = {
      ...book,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };
    await this.db.books.add(created);
    return created;
  }

  async getBook(bookId: string): Promise<Book | undefined> {
    return this.db.books.get(bookId);
  }

  async getUserBook(bookId: string): Promise<UserBook | undefined> {
    return this.db.userBooks.get(bookId);
  }

  async listUserBooks(): Promise<UserBook[]> {
    const items = await this.db.userBooks.toArray();
    return items.sort((a, b) => b.lastReadAt - a.lastReadAt);
  }

  async listUserBooksByStatus(status: BookStatus): Promise<UserBook[]> {
    const items = await this.db.userBooks.where("status").equals(status).toArray();
    return items.sort((a, b) => b.lastReadAt - a.lastReadAt);
  }

  async updateUserBook(bookId: string, patch: Partial<Omit<UserBook, "bookId">>): Promise<void> {
    const updated = await this.db.userBooks.update(bookId, patch);
    if (updated === 0) {
      throw new Error(`userBook not found: ${bookId}`);
    }
  }

  async setBookStatus(bookId: string, status: BookStatus): Promise<void> {
    const now = Date.now();
    const existing = await this.db.userBooks.get(bookId);

    if (existing) {
      const patch: Partial<UserBook> = { status };
      if (status === "reading" && existing.startedAt === null) {
        patch.startedAt = now;
      }
      if (status === "read") {
        patch.finishedAt = now;
      }
      await this.db.userBooks.update(bookId, patch);
      return;
    }

    const created: UserBook = {
      bookId,
      status,
      currentPage: 0,
      startedAt: status === "reading" ? now : null,
      finishedAt: status === "read" ? now : null,
      createdAt: now,
      lastReadAt: now,
    };
    await this.db.userBooks.add(created);
  }

  async touchLastRead(bookId: string, currentPage: number, timestamp: number): Promise<void> {
    const updated = await this.db.userBooks.update(bookId, {
      currentPage,
      lastReadAt: timestamp,
    });
    if (updated === 0) {
      throw new Error(`userBook not found: ${bookId}`);
    }
  }

  async addSession(session: Omit<ReadingSession, "id" | "createdAt">): Promise<ReadingSession> {
    const created: ReadingSession = {
      ...session,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };
    await this.db.readingSessions.add(created);
    return created;
  }

  async listSessionsByDateRange(startMs: number, endMs: number): Promise<ReadingSession[]> {
    const items = await this.db.readingSessions
      .where("startedAt")
      .between(startMs, endMs, true, false)
      .toArray();
    return items.sort((a, b) => a.startedAt - b.startedAt);
  }

  async listSessionsForBook(bookId: string): Promise<ReadingSession[]> {
    const items = await this.db.readingSessions.where("bookId").equals(bookId).toArray();
    return items.sort((a, b) => a.startedAt - b.startedAt);
  }

  async listAllSessions(): Promise<ReadingSession[]> {
    const items = await this.db.readingSessions.toArray();
    return items.sort((a, b) => a.startedAt - b.startedAt);
  }

  async getLastSessionForBook(bookId: string): Promise<ReadingSession | undefined> {
    const items = await this.db.readingSessions.where("bookId").equals(bookId).toArray();
    if (items.length === 0) {
      return undefined;
    }
    return items.reduce((latest, current) =>
      current.endedAt > latest.endedAt ? current : latest,
    );
  }

  async getActiveSession(): Promise<ActiveSession | undefined> {
    return this.db.activeSession.get(ACTIVE_SESSION_ID);
  }

  async startActiveSession(bookId: string, startPage: number, startedAt: number): Promise<void> {
    await this.db.activeSession.put({
      id: ACTIVE_SESSION_ID,
      bookId,
      startPage,
      startedAt,
    });
  }

  async clearActiveSession(): Promise<void> {
    await this.db.activeSession.delete(ACTIVE_SESSION_ID);
  }

  async getPreferenceProfile(): Promise<PreferenceProfile | undefined> {
    return this.db.preferences.get(PREFERENCE_PROFILE_ID);
  }

  async savePreferenceProfile(profile: Omit<PreferenceProfile, "id">): Promise<void> {
    await this.db.preferences.put({ ...profile, id: PREFERENCE_PROFILE_ID });
  }

  async getAiProfile(): Promise<AiProfile | undefined> {
    return this.db.aiProfiles.get(AI_PROFILE_ID);
  }

  async saveAiProfile(profile: Omit<AiProfile, "id">): Promise<void> {
    await this.db.aiProfiles.put({ ...profile, id: AI_PROFILE_ID });
  }

  async listRecommendations(): Promise<AiRecommendation[]> {
    const items = await this.db.recommendations.toArray();
    return items.sort((a, b) => b.matchPercent - a.matchPercent);
  }

  async replaceActiveRecommendations(items: AiRecommendation[]): Promise<void> {
    // 피드백을 남긴 추천은 학습 데이터로 보존하고 active만 교체한다
    // Keep feedback-bearing records for learning; replace only active ones
    await this.db.transaction("rw", this.db.recommendations, async () => {
      await this.db.recommendations.where("status").equals("active").delete();
      await this.db.recommendations.bulkPut(items);
    });
  }

  async updateRecommendation(
    id: string,
    patch: { status: RecommendationStatus; feedbackReason?: string },
  ): Promise<void> {
    const updated = await this.db.recommendations.update(id, patch);
    if (updated === 0) {
      throw new Error(`recommendation not found: ${id}`);
    }
  }
}
