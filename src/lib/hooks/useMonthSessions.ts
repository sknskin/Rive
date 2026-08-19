"use client";

import { useEffect, useState } from "react";
import { getRepository } from "@/lib/repository";
import type { Book, ReadingSession } from "@/lib/types";

export interface SessionWithBook {
  session: ReadingSession;
  book: Book | undefined;
}

export interface DaySummary {
  items: SessionWithBook[];
  totalSeconds: number;
  totalPages: number;
}

interface MonthSessionsState {
  // key: 해당 월의 일(1–31)
  // key: day of month (1–31)
  days: Map<number, DaySummary>;
  loading: boolean;
  error: string;
}

// 한 달치 세션을 날짜별로 그룹핑해 캘린더에 공급한다 (reloadKey 변경 시 재조회)
// Load a month of sessions grouped by day for the calendar (refetches when reloadKey changes)
export function useMonthSessions(
  year: number,
  month: number,
  reloadKey: number = 0,
): MonthSessionsState {
  const [state, setState] = useState<MonthSessionsState>({
    days: new Map(),
    loading: true,
    error: "",
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState((previous) => ({ ...previous, loading: true }));
      const repository = getRepository();
      try {
        const startMs = new Date(year, month, 1).getTime();
        const endMs = new Date(year, month + 1, 1).getTime();
        const sessions = await repository.listSessionsByDateRange(startMs, endMs);

        // 월 세션에 등장한 책을 한 번에 조회해 원격 저장소의 N+1 왕복을 피한다
        // Fetch all books for the month at once to avoid N+1 remote round trips
        const bookIds = [...new Set(sessions.map((session) => session.bookId))];
        const booksById = await repository.listBooksByIds(bookIds);
        const days = new Map<number, DaySummary>();

        for (const session of sessions) {
          const day = new Date(session.startedAt).getDate();
          const summary = days.get(day) ?? { items: [], totalSeconds: 0, totalPages: 0 };
          summary.items.push({ session, book: booksById.get(session.bookId) });
          summary.totalSeconds += session.durationSeconds;
          summary.totalPages += session.pagesRead;
          days.set(day, summary);
        }

        if (!cancelled) {
          setState({ days, loading: false, error: "" });
        }
      } catch (error) {
        console.error("[useMonthSessions] failed to load:", error);
        if (!cancelled) {
          setState({ days: new Map(), loading: false, error: "기록을 불러오지 못했어요." });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [year, month, reloadKey]);

  return state;
}
