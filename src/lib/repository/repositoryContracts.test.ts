import "fake-indexeddb/auto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { DexieRepository } from "./dexieRepository";
import type { UserBook } from "@/lib/types";

function userBook(bookId: string, lastReadAt: number): UserBook {
  return {
    bookId,
    status: "reading",
    currentPage: 0,
    startedAt: 1,
    finishedAt: null,
    createdAt: 1,
    lastReadAt,
  };
}

describe("DexieRepository core contracts", () => {
  const db = getDb();
  const repository = new DexieRepository();

  beforeEach(async () => {
    await Promise.all(db.tables.map((table) => table.clear()));
  });

  afterAll(() => db.close());

  it("lists user books by most recently read first", async () => {
    await db.userBooks.bulkAdd([
      userBook("old", 100),
      userBook("new", 300),
      userBook("middle", 200),
    ]);

    const rows = await repository.listUserBooks();

    expect(rows.map((row) => row.bookId)).toEqual(["new", "middle", "old"]);
  });

  it("returns undefined when a requested book does not exist", async () => {
    await expect(repository.getBook("missing")).resolves.toBeUndefined();
  });

  it("throws when metadata is updated for a missing book", async () => {
    await expect(repository.updateBookMeta("missing", { pageCount: 10 })).rejects.toThrow(
      "book not found: missing",
    );
  });
});
