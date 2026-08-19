import type { Book, ReadingSession, UserBook } from "@/lib/types";
import { countFinishedBooks, sessionsInRange } from "@/lib/insights";

// 리캡 통계 — 전부 일반 계산, AI는 마지막 한 줄 요약만 (스펙 §58, §66)
// Wrapped stats — plain computation only; AI writes just the one-line summary (spec §58, §66)

export type WrappedScope = "month" | "year";

export interface WrappedStats {
  id: string;
  label: string;
  totalSeconds: number;
  totalPages: number;
  sessionCount: number;
  readingDays: number;
  finishedBooks: number;
  longestSessionSeconds: number;
  topAuthor: string | null;
  topGenre: string | null;
}

export function computeWrappedStats(
  scope: WrappedScope,
  now: Date,
  sessions: ReadingSession[],
  userBooks: UserBook[],
  booksById: Map<string, Book>,
): WrappedStats {
  const year = now.getFullYear();
  const startMs =
    scope === "month" ? new Date(year, now.getMonth(), 1).getTime() : new Date(year, 0, 1).getTime();
  const endMs = now.getTime() + 1;
  const inRange = sessionsInRange(sessions, startMs, endMs);

  const dayKeys = new Set(
    inRange.map((session) => new Date(session.startedAt).toDateString()),
  );

  // 저자/장르는 세션 시간 가중으로 상위 1개를 뽑는다
  // Top author/genre weighted by session time
  const authorSeconds = new Map<string, number>();
  const genreSeconds = new Map<string, number>();
  for (const session of inRange) {
    const book = booksById.get(session.bookId);
    if (!book) {
      continue;
    }
    for (const author of book.authors) {
      authorSeconds.set(author, (authorSeconds.get(author) ?? 0) + session.durationSeconds);
    }
    const categories = book.categories ?? [];
    for (const category of categories) {
      genreSeconds.set(
        category,
        (genreSeconds.get(category) ?? 0) + session.durationSeconds / categories.length,
      );
    }
  }
  const topOf = (totals: Map<string, number>): string | null => {
    let best: string | null = null;
    let bestValue = 0;
    for (const [key, value] of totals) {
      if (value > bestValue) {
        best = key;
        bestValue = value;
      }
    }
    return best;
  };

  const monthLabel = `${year}년 ${now.getMonth() + 1}월`;
  return {
    id: scope === "month" ? `${year}-${String(now.getMonth() + 1).padStart(2, "0")}` : `${year}`,
    label: scope === "month" ? monthLabel : `${year}년`,
    totalSeconds: inRange.reduce((sum, session) => sum + session.durationSeconds, 0),
    totalPages: inRange.reduce((sum, session) => sum + session.pagesRead, 0),
    sessionCount: inRange.length,
    readingDays: dayKeys.size,
    finishedBooks: countFinishedBooks(userBooks, startMs, endMs),
    longestSessionSeconds: inRange.reduce(
      (max, session) => Math.max(max, session.durationSeconds),
      0,
    ),
    topAuthor: topOf(authorSeconds),
    topGenre: topOf(genreSeconds),
  };
}
