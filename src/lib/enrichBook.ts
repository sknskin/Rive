import { getRepository } from "@/lib/repository";
import type { BookMeta } from "@/lib/bookSearch/enrichGoogle";

// 클라이언트 측 메타 보강 — 등록 직후/상세 진입 시 부족한 정보를 채운다
// Client-side enrichment — fills missing metadata after registration or on detail view

function needsEnrichment(pageCount: number, description: string | undefined): boolean {
  return pageCount === 0 || !description || description === "";
}

export async function enrichBookMeta(bookId: string): Promise<boolean> {
  const repository = getRepository();
  const book = await repository.getBook(bookId);
  if (!book) {
    return false;
  }
  // 이미 시도했거나 충분한 정보가 있으면 호출하지 않는다 (재시도 폭주 방지)
  // Skip when already attempted or sufficiently filled (prevents retry storms)
  if (book.enrichedAt !== undefined || !needsEnrichment(book.pageCount, book.description)) {
    return false;
  }

  try {
    const params = new URLSearchParams({
      isbn: book.isbn13,
      title: book.title,
      author: book.authors[0] ?? "",
    });
    const response = await fetch(`/api/books/enrich?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`enrich request failed: ${response.status}`);
    }
    const meta = (await response.json()) as BookMeta;

    // 기존 값이 비어 있는 항목만 채운다 — 사용자가 이미 가진 데이터를 덮지 않는다
    // Fill only empty fields — never overwrite data the user already has
    await repository.updateBookMeta(bookId, {
      enrichedAt: Date.now(),
      ...(book.pageCount === 0 && meta.pageCount > 0 ? { pageCount: meta.pageCount } : {}),
      ...(!book.description && meta.description !== ""
        ? { description: meta.description }
        : {}),
      ...(!book.categories || book.categories.length === 0
        ? meta.categories.length > 0
          ? { categories: meta.categories }
          : {}
        : {}),
    });
    return true;
  } catch (error) {
    // 실패 시 enrichedAt을 남기지 않아 다음 기회에 자연스럽게 재시도된다
    // On failure, enrichedAt stays unset so a later visit retries naturally
    console.error("[enrichBook] failed to enrich metadata:", error);
    return false;
  }
}
