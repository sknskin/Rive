import { getRepository } from "@/lib/repository";

// 세션 수정/삭제 후 서재 진행 상태(currentPage/lastReadAt)를 남은 기록 기준으로 재계산한다
// Recompute shelf progress (currentPage/lastReadAt) from remaining sessions after edits/deletes
export async function recomputeBookProgress(bookId: string): Promise<void> {
  const repository = getRepository();
  const userBook = await repository.getUserBook(bookId);
  if (!userBook) {
    return;
  }

  const sessions = await repository.listSessionsForBook(bookId);
  if (sessions.length === 0) {
    await repository.updateUserBook(bookId, {
      currentPage: 0,
      lastReadAt: userBook.createdAt,
    });
    return;
  }

  const latest = sessions.reduce((a, b) => (b.endedAt > a.endedAt ? b : a));
  await repository.updateUserBook(bookId, {
    currentPage: latest.endPage,
    lastReadAt: latest.endedAt,
  });
}
