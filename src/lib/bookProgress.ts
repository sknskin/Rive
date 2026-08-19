import type { ReadingSession, UserBook } from "@/lib/types";

// 세션 수정/삭제 트랜잭션 안에서 사용할 수 있도록 I/O 없이 진행 상태를 계산한다.
// Pure progress derivation so repositories can call it inside their own transactions.
export function deriveBookProgress(
  userBook: UserBook,
  sessions: ReadingSession[],
): Pick<UserBook, "currentPage" | "lastReadAt"> {
  if (sessions.length === 0) {
    return {
      currentPage: 0,
      lastReadAt: userBook.createdAt,
    };
  }

  const latest = sessions.reduce((a, b) => {
    if (b.endedAt !== a.endedAt) {
      return b.endedAt > a.endedAt ? b : a;
    }
    if (b.createdAt !== a.createdAt) {
      return b.createdAt > a.createdAt ? b : a;
    }
    return b.id > a.id ? b : a;
  });
  return {
    currentPage: latest.endPage,
    lastReadAt: latest.endedAt,
  };
}
