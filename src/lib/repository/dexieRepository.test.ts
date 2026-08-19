import "fake-indexeddb/auto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ACTIVE_SESSION_ID } from "@/lib/constants";
import { getDb } from "@/lib/db";
import { DexieRepository } from "@/lib/repository/dexieRepository";
import type { AtomicSessionWrite } from "@/lib/repository/types";
import type { UserBook } from "@/lib/types";

const bookId = "book-atomic";

function userBook(): UserBook {
  return {
    bookId,
    status: "reading",
    currentPage: 10,
    startedAt: 10,
    finishedAt: null,
    createdAt: 10,
    lastReadAt: 100,
  };
}

function write(): AtomicSessionWrite {
  return {
    session: {
      id: "session-atomic",
      bookId,
      startedAt: 200,
      endedAt: 300,
      durationSeconds: 100,
      startPage: 10,
      endPage: 20,
      pagesRead: 10,
      memo: "",
      createdAt: 300,
    },
    progressMode: "always",
    markAsRead: true,
    clearActiveSession: true,
  };
}

describe("DexieRepository atomic reading-session mutations", () => {
  const db = getDb();
  const repository = new DexieRepository();

  beforeEach(async () => {
    await Promise.all(db.tables.map((table) => table.clear()));
  });

  afterAll(() => {
    db.close();
  });

  it("saves session, progress, completion and active-timer cleanup together", async () => {
    await db.userBooks.add(userBook());
    await db.activeSession.add({
      id: ACTIVE_SESSION_ID,
      bookId,
      startedAt: 200,
      startPage: 10,
    });

    const input = write();
    await repository.saveSessionAtomic(input);

    expect(await db.readingSessions.toArray()).toEqual([input.session]);
    expect(await db.userBooks.get(bookId)).toMatchObject({
      currentPage: 20,
      lastReadAt: 300,
      status: "read",
      finishedAt: 300,
    });
    expect(await db.activeSession.get(ACTIVE_SESSION_ID)).toBeUndefined();
  });

  it("preserves a newer active timer while an older session is being saved", async () => {
    await db.userBooks.add(userBook());
    await db.activeSession.add({
      id: ACTIVE_SESSION_ID,
      bookId,
      startedAt: 400,
      startPage: 20,
    });

    await repository.saveSessionAtomic(write());

    expect(await db.activeSession.get(ACTIVE_SESSION_ID)).toEqual({
      id: ACTIVE_SESSION_ID,
      bookId,
      startedAt: 400,
      startPage: 20,
    });
  });

  it("rolls back a failed save, then reuses the same id without creating a duplicate", async () => {
    await db.activeSession.add({
      id: ACTIVE_SESSION_ID,
      bookId,
      startedAt: 200,
      startPage: 10,
    });
    const input = write();

    await expect(repository.saveSessionAtomic(input)).rejects.toThrow("userBook not found");
    expect(await db.readingSessions.count()).toBe(0);
    expect(await db.activeSession.get(ACTIVE_SESSION_ID)).toBeDefined();

    await db.userBooks.add(userBook());
    await repository.saveSessionAtomic(input);
    await repository.saveSessionAtomic(input);

    expect(await db.readingSessions.count()).toBe(1);
    expect(await db.userBooks.get(bookId)).toMatchObject({ currentPage: 20, lastReadAt: 300 });

    const corrected = {
      ...input,
      session: {
        ...input.session,
        endedAt: 250,
        endPage: 15,
        pagesRead: 5,
      },
    };
    await repository.saveSessionAtomic(corrected);
    expect(await db.readingSessions.count()).toBe(1);
    expect(await db.readingSessions.get(input.session.id)).toMatchObject({ endPage: 15 });
    expect(await db.userBooks.get(bookId)).toMatchObject({ currentPage: 15, lastReadAt: 250 });
  });

  it("rolls back session edits when progress recomputation fails", async () => {
    const input = write();
    await db.readingSessions.add(input.session);

    await expect(
      repository.updateSessionAndRecompute(input.session.id, bookId, {
        endedAt: 400,
        endPage: 30,
        pagesRead: 20,
      }),
    ).rejects.toThrow("userBook not found");
    expect(await db.readingSessions.get(input.session.id)).toMatchObject({
      endedAt: 300,
      endPage: 20,
    });

    await db.userBooks.add(userBook());
    await repository.updateSessionAndRecompute(input.session.id, bookId, {
      endedAt: 400,
      endPage: 30,
      pagesRead: 20,
    });
    expect(await db.userBooks.get(bookId)).toMatchObject({ currentPage: 30, lastReadAt: 400 });
  });

  it("rolls back deletion when progress recomputation fails, then safely retries", async () => {
    const input = write();
    await db.readingSessions.add(input.session);

    await expect(
      repository.deleteSessionAndRecompute(input.session.id, bookId),
    ).rejects.toThrow("userBook not found");
    expect(await db.readingSessions.get(input.session.id)).toBeDefined();

    await db.userBooks.add(userBook());
    await repository.deleteSessionAndRecompute(input.session.id, bookId);
    expect(await db.readingSessions.get(input.session.id)).toBeUndefined();
    expect(await db.userBooks.get(bookId)).toMatchObject({ currentPage: 0, lastReadAt: 10 });
  });
});
