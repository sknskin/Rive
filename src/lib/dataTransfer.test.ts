// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "./db";
import { importAllData, parseBackupPayload, validateImportTables } from "./dataTransfer";

const book = {
  id: "book-1", title: "테스트 책", authors: ["작가"], publisher: "출판사",
  isbn13: "", coverUrl: "", pageCount: 300, kakaoUrl: "", googleBooksId: "",
  createdAt: 1,
};
const userBook = {
  bookId: "book-1", status: "reading", currentPage: 20, startedAt: 1,
  finishedAt: null, createdAt: 1, lastReadAt: 1,
};
const session = {
  id: "session-1", bookId: "book-1", startedAt: 10, endedAt: 20,
  durationSeconds: 10, startPage: 1, endPage: 5, pagesRead: 4, memo: "", createdAt: 20,
};

describe("backup validation", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    const db = getDb();
    await db.transaction("rw", db.tables, async () => {
      await Promise.all(db.tables.map((table) => table.clear()));
    });
    vi.restoreAllMocks();
  });
  it("accepts an exported payload after a JSON round trip", () => {
    const text = JSON.stringify({
      app: "rive", version: 1, exportedAt: 100,
      tables: { books: [book], userBooks: [userBook], readingSessions: [session] },
    });
    const payload = parseBackupPayload(text);
    const tables = validateImportTables(payload.tables);
    expect(tables.readingSessions).toHaveLength(1);
  });

  it("accepts current and historical goal ids from the server export shape", () => {
    const goals = [
      { id: "current", year: 2026, targetBooks: 12, targetPages: 0, targetHours: 0, updatedAt: 1 },
      { id: "2025", year: 2025, targetBooks: 10, targetPages: 0, targetHours: 0, updatedAt: 1 },
    ];
    expect(validateImportTables({ goals }).goals).toEqual(goals);
  });

  it("rejects a negative page before any restore write", () => {
    expect(() => validateImportTables({ books: [{ ...book, pageCount: -1 }] })).toThrow(
      "books[0].pageCount",
    );
  });

  it("rejects a child row whose book reference is missing", () => {
    expect(() => validateImportTables({ userBooks: [userBook] })).toThrow(
      "userBooks[0].bookId",
    );
  });

  it("rejects a backup version newer than the app", () => {
    expect(() => parseBackupPayload(JSON.stringify({ app: "rive", version: 2, exportedAt: 1, tables: {} }))).toThrow(
      "unsupported backup version",
    );
  });

  it("rejects a primitive table row", () => {
    expect(() => validateImportTables({ books: ["not-a-row"] })).toThrow(
      "books[0].row",
    );
  });

  it("rejects malformed rows before the server-mode uploader can run", async () => {
    window.localStorage.setItem("rive-auth-mode", "supabase");
    const file = {
      text: async () => JSON.stringify({
        app: "rive", version: 1, exportedAt: 100, tables: { books: [false] },
      }),
    } as File;
    await expect(importAllData(file)).rejects.toThrow("books[0].row");
  });

  it("rolls back earlier table writes when a later restore write fails", async () => {
    const db = getDb();
    vi.spyOn(db.table("userBooks"), "bulkPut").mockRejectedValueOnce(
      new Error("injected write failure"),
    );
    const file = {
      text: async () => JSON.stringify({
        app: "rive", version: 1, exportedAt: 100,
        tables: { books: [book], userBooks: [userBook] },
      }),
    } as File;

    await expect(importAllData(file)).rejects.toThrow("injected write failure");
    expect(await db.books.get(book.id)).toBeUndefined();
  });

  it("rejects an incomplete preference before overwriting the existing row", async () => {
    const db = getDb();
    const existing = {
      id: "primary" as const,
      favoriteGenres: ["소설"],
      dislikedGenres: [],
      lovedBooks: [],
      dislikedBooks: [],
      fictionPreference: "fiction" as const,
      readingPurposes: ["즐거움"],
      updatedAt: 1,
    };
    await db.preferences.put(existing);
    const file = {
      text: async () => JSON.stringify({
        app: "rive",
        version: 1,
        exportedAt: 100,
        tables: {
          preferences: [{ id: "primary", favoriteGenres: [], dislikedGenres: [], updatedAt: 2 }],
        },
      }),
    } as File;

    await expect(importAllData(file)).rejects.toThrow("preferences[0].lovedBooks");
    expect(await db.preferences.get("primary")).toEqual(existing);
  });

  it("allows server-mode child rows to reference books already stored on the server", () => {
    expect(() =>
      validateImportTables({ userBooks: [userBook] }, new Set(), false),
    ).not.toThrow();
  });
});
