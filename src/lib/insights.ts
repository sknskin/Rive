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

// 히트맵 강도 단계 경계(초) — 15분/45분/90분 (스펙 §30)
// Heatmap intensity thresholds in seconds — 15/45/90 minutes (spec §30)
const HEAT_LEVEL_1_SECONDS = 1;
const HEAT_LEVEL_2_SECONDS = 15 * 60;
const HEAT_LEVEL_3_SECONDS = 45 * 60;
const HEAT_LEVEL_4_SECONDS = 90 * 60;

// 'YYYY-M-D' 로컬 날짜 키
// 'YYYY-M-D' local date key
export function dayKey(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

// 날짜별 독서량(초) 집계 — 히트맵의 데이터 소스
// Daily reading totals in seconds — the heatmap's data source
export function dailyTotals(sessions: ReadingSession[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const session of sessions) {
    const key = dayKey(session.startedAt);
    totals.set(key, (totals.get(key) ?? 0) + session.durationSeconds);
  }
  return totals;
}

// 연속 독서 일수 — 오늘 기록이 없으면 어제까지의 연속을 센다 (아직 안 읽은 오늘이 끊지 않게)
// Current reading streak in days — counts through yesterday when today has no record yet
export function currentStreakDays(totals: Map<string, number>, nowMs: number): number {
  const cursor = new Date(nowMs);
  cursor.setHours(0, 0, 0, 0);
  if (!totals.has(dayKey(cursor.getTime()))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  let streak = 0;
  while (totals.has(dayKey(cursor.getTime()))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// 독서량(초) → 히트맵 강도 0–4
// Reading seconds → heatmap intensity 0–4
export function heatLevel(totalSeconds: number): number {
  if (totalSeconds < HEAT_LEVEL_1_SECONDS) {
    return 0;
  }
  if (totalSeconds < HEAT_LEVEL_2_SECONDS) {
    return 1;
  }
  if (totalSeconds < HEAT_LEVEL_3_SECONDS) {
    return 2;
  }
  if (totalSeconds < HEAT_LEVEL_4_SECONDS) {
    return 3;
  }
  return 4;
}

// 예상 완독일 — 최근 독서 페이스 기반, AI 미사용 (스펙 §35)
// Estimated days to finish — based on recent pace, no AI (spec §35)
const ESTIMATE_WINDOW_DAYS = 30;
const MS_PER_DAY_ESTIMATE = 24 * 3600 * 1000;

export function estimateDaysToFinish(
  sessions: ReadingSession[],
  currentPage: number,
  pageCount: number,
  nowMs: number,
): number | null {
  if (pageCount <= 0 || currentPage <= 0 || currentPage >= pageCount) {
    return null;
  }
  const windowStart = nowMs - ESTIMATE_WINDOW_DAYS * MS_PER_DAY_ESTIMATE;
  const recentPages = sessions
    .filter((session) => session.startedAt >= windowStart)
    .reduce((sum, session) => sum + session.pagesRead, 0);
  if (recentPages <= 0) {
    return null;
  }
  const pagesPerDay = recentPages / ESTIMATE_WINDOW_DAYS;
  return Math.max(1, Math.ceil((pageCount - currentPage) / pagesPerDay));
}

export interface GenreSeconds {
  name: string;
  totalSeconds: number;
}

const GENRE_TOP_N = 6;

// 장르 분포 — 실제 독서 시간을 책의 카테고리에 배분해 집계 (스펙 §33, AI 미사용)
// Genre distribution — allocates actual reading time to book categories (spec §33, no AI)
export function genreDistribution(
  sessions: ReadingSession[],
  categoriesByBookId: Map<string, string[]>,
  topN: number = GENRE_TOP_N,
): GenreSeconds[] {
  const totals = new Map<string, number>();
  for (const session of sessions) {
    const categories = categoriesByBookId.get(session.bookId) ?? [];
    if (categories.length === 0) {
      continue;
    }
    // 한 세션의 시간을 카테고리 수로 나눠 배분해 합계 부풀림을 막는다
    // Split a session's time across its categories to avoid inflated totals
    const share = session.durationSeconds / categories.length;
    for (const category of categories) {
      totals.set(category, (totals.get(category) ?? 0) + share);
    }
  }
  return [...totals.entries()]
    .map(([name, totalSeconds]) => ({ name, totalSeconds: Math.round(totalSeconds) }))
    .sort((a, b) => b.totalSeconds - a.totalSeconds)
    .slice(0, topN);
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
