import { describe, expect, it } from "vitest";
import { deriveBookProgress } from "@/lib/bookProgress";
import type { ReadingSession, UserBook } from "@/lib/types";

const userBook: UserBook = {
  bookId: "book-1",
  status: "reading",
  currentPage: 80,
  startedAt: 100,
  finishedAt: null,
  createdAt: 100,
  lastReadAt: 900,
};

function session(
  id: string,
  endedAt: number,
  endPage: number,
  createdAt = endedAt,
): ReadingSession {
  return {
    id,
    bookId: userBook.bookId,
    startedAt: endedAt - 10,
    endedAt,
    durationSeconds: 10,
    startPage: Math.max(0, endPage - 10),
    endPage,
    pagesRead: 10,
    memo: "",
    createdAt,
  };
}

describe("deriveBookProgress", () => {
  it("resets progress to the shelf creation time when the last session is deleted", () => {
    expect(deriveBookProgress(userBook, [])).toEqual({
      currentPage: 0,
      lastReadAt: userBook.createdAt,
    });
  });

  it("uses the session that ended most recently regardless of input order", () => {
    expect(
      deriveBookProgress(userBook, [session("new", 800, 60), session("old", 500, 30)]),
    ).toEqual({ currentPage: 60, lastReadAt: 800 });
  });

  it("breaks equal end-time ties with creation time for deterministic retries", () => {
    expect(
      deriveBookProgress(userBook, [
        session("old", 800, 40, 810),
        session("new", 800, 50, 820),
      ]),
    ).toEqual({ currentPage: 50, lastReadAt: 800 });
  });
});
