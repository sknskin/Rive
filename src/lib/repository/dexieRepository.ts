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
import { ACTIVE_SESSION_ID, AI_PROFILE_ID, PREFERENCE_PROFILE_ID } from "@/lib/constants";
import { getDb } from "@/lib/db";
import { deriveBookProgress } from "@/lib/bookProgress";
import type { AtomicSessionWrite, ReadingRepository } from "./types";

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

  async listBooksByIds(bookIds: string[]): Promise<Map<string, Book>> {
    const uniqueIds = [...new Set(bookIds)];
    const rows = await this.db.books.bulkGet(uniqueIds);
    const byId = new Map<string, Book>();
    rows.forEach((row) => {
      if (row) {
        byId.set(row.id, row);
      }
    });
    return byId;
  }

  async getBook(bookId: string): Promise<Book | undefined> {
    return this.db.books.get(bookId);
  }

  async updateBookMeta(
    bookId: string,
    patch: Partial<Pick<Book, "pageCount" | "description" | "categories" | "enrichedAt">>,
  ): Promise<void> {
    const updated = await this.db.books.update(bookId, patch);
    if (updated === 0) {
      throw new Error(`book not found: ${bookId}`);
    }
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

  async saveSessionAtomic(input: AtomicSessionWrite): Promise<ReadingSession> {
    const { session } = input;
    await this.db.transaction(
      "rw",
      [this.db.readingSessions, this.db.userBooks, this.db.activeSession],
      async () => {
        const existingSession = await this.db.readingSessions.get(session.id);
        if (existingSession && existingSession.bookId !== session.bookId) {
          throw new Error(`session id collision: ${session.id}`);
        }
        // A retry may carry corrected form values; replace the same-id row so row and progress stay aligned.
        await this.db.readingSessions.put(session);

        const userBook = await this.db.userBooks.get(session.bookId);
        if (!userBook) {
          throw new Error(`userBook not found: ${session.bookId}`);
        }

        const shouldUpdateProgress =
          input.progressMode === "always" || session.endedAt >= userBook.lastReadAt;
        const patch: Partial<UserBook> = {};
        if (existingSession) {
          const sessions = await this.db.readingSessions
            .where("bookId")
            .equals(session.bookId)
            .toArray();
          Object.assign(patch, deriveBookProgress(userBook, sessions));
        } else if (shouldUpdateProgress) {
          patch.currentPage = session.endPage;
          patch.lastReadAt = session.endedAt;
        }
        if (input.markAsRead) {
          patch.status = "read";
          patch.finishedAt = session.endedAt;
        }
        if (Object.keys(patch).length > 0) {
          await this.db.userBooks.update(session.bookId, patch);
        }
        if (input.clearActiveSession) {
          const active = await this.db.activeSession.get(ACTIVE_SESSION_ID);
          if (
            active?.bookId === session.bookId &&
            active.startedAt === session.startedAt &&
            active.startPage === session.startPage
          ) {
            await this.db.activeSession.delete(ACTIVE_SESSION_ID);
          }
        }
      },
    );
    return session;
  }

  async updateSessionAndRecompute(
    id: string,
    bookId: string,
    patch: Partial<Omit<ReadingSession, "id" | "bookId" | "createdAt">>,
  ): Promise<void> {
    await this.db.transaction("rw", [this.db.readingSessions, this.db.userBooks], async () => {
      const existing = await this.db.readingSessions.get(id);
      if (!existing || existing.bookId !== bookId) {
        throw new Error(`session not found: ${id}`);
      }
      await this.db.readingSessions.update(id, patch);
      const userBook = await this.db.userBooks.get(bookId);
      if (!userBook) {
        throw new Error(`userBook not found: ${bookId}`);
      }
      const sessions = await this.db.readingSessions.where("bookId").equals(bookId).toArray();
      await this.db.userBooks.update(bookId, deriveBookProgress(userBook, sessions));
    });
  }

  async deleteSessionAndRecompute(id: string, bookId: string): Promise<void> {
    await this.db.transaction("rw", [this.db.readingSessions, this.db.userBooks], async () => {
      const existing = await this.db.readingSessions.get(id);
      if (existing && existing.bookId !== bookId) {
        throw new Error(`session does not belong to book: ${id}`);
      }
      await this.db.readingSessions.delete(id);
      const userBook = await this.db.userBooks.get(bookId);
      if (!userBook) {
        throw new Error(`userBook not found: ${bookId}`);
      }
      const sessions = await this.db.readingSessions.where("bookId").equals(bookId).toArray();
      await this.db.userBooks.update(bookId, deriveBookProgress(userBook, sessions));
    });
  }

  async removeBookCompletely(bookId: string): Promise<void> {
    // 책 제거 시 연관 세션·노트·인용구·서재 상태·진행 중 세션을 함께 지워 고아 레코드를 남기지 않는다
    // Removing a book also deletes its sessions/notes/quotes/shelf entry/active session — no orphans
    await this.db.transaction(
      "rw",
      [
        this.db.books,
        this.db.userBooks,
        this.db.readingSessions,
        this.db.notes,
        this.db.quotes,
        this.db.activeSession,
      ],
      async () => {
        await this.db.readingSessions.where("bookId").equals(bookId).delete();
        await this.db.notes.where("bookId").equals(bookId).delete();
        await this.db.quotes.where("bookId").equals(bookId).delete();
        const active = await this.db.activeSession.get(ACTIVE_SESSION_ID);
        if (active && active.bookId === bookId) {
          await this.db.activeSession.delete(ACTIVE_SESSION_ID);
        }
        await this.db.userBooks.delete(bookId);
        await this.db.books.delete(bookId);
      },
    );
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

  async addNote(note: Omit<BookNote, "id" | "createdAt">): Promise<BookNote> {
    const created: BookNote = { ...note, id: crypto.randomUUID(), createdAt: Date.now() };
    await this.db.notes.add(created);
    return created;
  }

  async listNotesForBook(bookId: string): Promise<BookNote[]> {
    const items = await this.db.notes.where("bookId").equals(bookId).toArray();
    return items.sort((a, b) => b.createdAt - a.createdAt);
  }

  async deleteNote(id: string): Promise<void> {
    await this.db.notes.delete(id);
  }

  async addQuote(quote: Omit<BookQuote, "id" | "createdAt">): Promise<BookQuote> {
    const created: BookQuote = { ...quote, id: crypto.randomUUID(), createdAt: Date.now() };
    await this.db.quotes.add(created);
    return created;
  }

  async listQuotesForBook(bookId: string): Promise<BookQuote[]> {
    const items = await this.db.quotes.where("bookId").equals(bookId).toArray();
    return items.sort((a, b) => b.createdAt - a.createdAt);
  }

  async deleteQuote(id: string): Promise<void> {
    await this.db.quotes.delete(id);
  }

  async getGoals(): Promise<ReadingGoals | undefined> {
    return this.db.goals.get("current");
  }

  async saveGoals(goals: Omit<ReadingGoals, "id">): Promise<void> {
    await this.db.goals.put({ ...goals, id: "current" });
  }

  async getWrapped(id: string): Promise<WrappedSummary | undefined> {
    return this.db.wrapped.get(id);
  }

  async saveWrapped(entry: WrappedSummary): Promise<void> {
    await this.db.wrapped.put(entry);
  }
}
