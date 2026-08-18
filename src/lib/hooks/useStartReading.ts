"use client";

import { useRouter } from "next/navigation";
import { DEFAULT_START_PAGE } from "@/lib/constants";
import { getRepository } from "@/lib/repository";
import type { BookSearchResult } from "@/lib/types";

// 독서 시작 공통 로직 — 홈/검색/책 상세 어디서든 재사용한다
// Shared start-reading logic — reusable from home, search, and book detail
export function useStartReading() {
  const router = useRouter();

  async function startExistingBook(bookId: string, startPage: number): Promise<void> {
    const repository = getRepository();
    // Want/Paused 책을 읽기 시작하면 Reading 상태로 전환한다 (완독/중단 이력은 유지)
    // Starting a want/paused book moves it to reading (read/dnf history preserved)
    const userBook = await repository.getUserBook(bookId);
    if (userBook && (userBook.status === "want" || userBook.status === "paused")) {
      await repository.setBookStatus(bookId, "reading");
    }
    await repository.startActiveSession(bookId, startPage, Date.now());
    router.push("/read");
  }

  async function startNewBook(
    result: BookSearchResult,
    startPage: number = DEFAULT_START_PAGE,
  ): Promise<void> {
    const repository = getRepository();
    // 검색에서 고른 새 책은 Library에 자동 등록하고 Reading 상태로 만든다 (스펙 §5)
    // A new book picked from search is auto-registered and marked Reading (spec §5)
    const book = await repository.upsertBookByIsbn(result);
    await repository.setBookStatus(book.id, "reading");
    await repository.startActiveSession(book.id, startPage, Date.now());
    router.push("/read");
  }

  return { startExistingBook, startNewBook };
}
