import { PEAK_WINDOW_HOURS } from "@/lib/constants";
import type { ReadingSession, UserBook } from "@/lib/types";

// Insights 통계 계산 — 전부 순수 함수, AI 사용 금지 영역 (스펙 §66)
// Insights statistics — pure functions only, no AI in this area (spec §66)

const HOURS_PER_DAY = 24;
const DAYS_PER_WEEK = 7;
const SECONDS_PER_HOUR = 3600;

export interface RangeSummary {
  totalSeconds: number;
  totalPages: number;
  readingDays: number;
  sessionCount: number;
}

// [startMs, endMs) 범위의 세션 필터
// Filter sessions within [startMs, endMs)
export function sessionsInRange(
  sessions: ReadingSession[],
  startMs: number,
  endMs: number,
): ReadingSession[] {
  return sessions.filter(
    (session) => session.startedAt >= startMs && session.startedAt < endMs,
  );
}

export function summarizeRange(
  sessions: ReadingSession[],
  startMs: number,
  endMs: number,
): RangeSummary {
  const inRange = sessionsInRange(sessions, startMs, endMs);
  const dayKeys = new Set(
    inRange.map((session) => {
      const date = new Date(session.startedAt);
      return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    }),
  );

  return {
    totalSeconds: inRange.reduce((sum, session) => sum + session.durationSeconds, 0),
    totalPages: inRange.reduce((sum, session) => sum + session.pagesRead, 0),
    readingDays: dayKeys.size,
    sessionCount: inRange.length,
  };
}

// 이번 주 시작(일요일 자정) — Calendar 그리드와 동일한 주 기준
// Start of this week (Sunday midnight) — same convention as the calendar grid
export function weekStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay());
}

export function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function yearStart(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1);
}

// Reading Speed: 읽은 페이지 합 / 걸린 시간 합 (스펙 §34)
// Reading speed: total pages / total hours (spec §34)
export function readingSpeedPagesPerHour(sessions: ReadingSession[]): number {
  const meaningful = sessions.filter(
    (session) => session.durationSeconds > 0 && session.pagesRead > 0,
  );
  const totalSeconds = meaningful.reduce((sum, session) => sum + session.durationSeconds, 0);
  if (totalSeconds === 0) {
    return 0;
  }
  const totalPages = meaningful.reduce((sum, session) => sum + session.pagesRead, 0);
  return Math.round(totalPages / (totalSeconds / SECONDS_PER_HOUR));
}

// 시간대별 독서량(초) — started_at 기준 (스펙 §31)
// Reading seconds per hour of day, keyed by started_at (spec §31)
export function hourHistogram(sessions: ReadingSession[]): number[] {
  const histogram = Array.from({ length: HOURS_PER_DAY }, () => 0);
  for (const session of sessions) {
    const hour = new Date(session.startedAt).getHours();
    histogram[hour] += session.durationSeconds;
  }
  return histogram;
}

export interface PeakWindow {
  startHour: number;
  endHour: number;
  totalSeconds: number;
}

// 가장 많이 읽는 연속 구간 탐색 (자정 넘김 포함)
// Find the busiest consecutive window (wrapping past midnight)
export function peakHourWindow(
  histogram: number[],
  windowHours: number = PEAK_WINDOW_HOURS,
): PeakWindow | null {
  const total = histogram.reduce((sum, seconds) => sum + seconds, 0);
  if (total === 0) {
    return null;
  }

  let best: PeakWindow = { startHour: 0, endHour: windowHours, totalSeconds: -1 };
  for (let start = 0; start < HOURS_PER_DAY; start++) {
    let windowTotal = 0;
    for (let offset = 0; offset < windowHours; offset++) {
      windowTotal += histogram[(start + offset) % HOURS_PER_DAY];
    }
    if (windowTotal > best.totalSeconds) {
      best = {
        startHour: start,
        endHour: (start + windowHours) % HOURS_PER_DAY,
        totalSeconds: windowTotal,
      };
    }
  }
  return best;
}

// 요일별 독서량(초) — 0=일요일 (스펙 §32)
// Reading seconds per weekday, 0 = Sunday (spec §32)
export function weekdayHistogram(sessions: ReadingSession[]): number[] {
  const histogram = Array.from({ length: DAYS_PER_WEEK }, () => 0);
  for (const session of sessions) {
    const weekday = new Date(session.startedAt).getDay();
    histogram[weekday] += session.durationSeconds;
  }
  return histogram;
}

// 기간 내 완독한 책 수
// Books finished within the range
export function countFinishedBooks(
  userBooks: UserBook[],
  startMs: number,
  endMs: number,
): number {
  return userBooks.filter(
    (userBook) =>
      userBook.status === "read" &&
      userBook.finishedAt !== null &&
      userBook.finishedAt >= startMs &&
      userBook.finishedAt < endMs,
  ).length;
}
