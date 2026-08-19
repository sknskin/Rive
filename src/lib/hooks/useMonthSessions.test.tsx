// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { Book, ReadingSession } from "@/lib/types";

const repository = vi.hoisted(() => ({
  listSessionsByDateRange: vi.fn(),
  listBooksByIds: vi.fn(),
}));

vi.mock("@/lib/repository", () => ({ getRepository: () => repository }));

import { useMonthSessions } from "@/lib/hooks/useMonthSessions";

afterEach(cleanup);

const book = (id: string): Book => ({
  id,
  title: `책 ${id}`,
  authors: [],
  publisher: "",
  isbn13: "",
  coverUrl: "",
  pageCount: 100,
  kakaoUrl: "",
  googleBooksId: "",
  createdAt: 1,
});

const session = (id: string, bookId: string, day: number): ReadingSession => ({
  id,
  bookId,
  startedAt: new Date(2026, 7, day, 12).getTime(),
  endedAt: new Date(2026, 7, day, 12, 30).getTime(),
  durationSeconds: 1800,
  startPage: 1,
  endPage: 11,
  pagesRead: 10,
  memo: "",
  createdAt: 1,
});

function Probe() {
  const state = useMonthSessions(2026, 7);
  if (state.loading) {
    return <p>loading</p>;
  }
  const summary = state.days.get(19);
  return <p>{summary?.items.map((item) => item.book?.title).join(",")}</p>;
}

describe("useMonthSessions", () => {
  beforeEach(() => {
    repository.listSessionsByDateRange.mockReset();
    repository.listBooksByIds.mockReset();
  });

  it("월 세션의 책을 중복 제거해 한 번에 조회한다", async () => {
    repository.listSessionsByDateRange.mockResolvedValue([
      session("s1", "book-1", 19),
      session("s2", "book-1", 19),
      session("s3", "book-2", 19),
    ]);
    repository.listBooksByIds.mockResolvedValue(
      new Map([
        ["book-1", book("book-1")],
        ["book-2", book("book-2")],
      ]),
    );

    render(<Probe />);

    await waitFor(() => expect(screen.getByText("책 book-1,책 book-1,책 book-2")).toBeInTheDocument());
    expect(repository.listBooksByIds).toHaveBeenCalledTimes(1);
    expect(repository.listBooksByIds).toHaveBeenCalledWith(["book-1", "book-2"]);
  });
});
