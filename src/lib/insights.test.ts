import { describe, expect, it } from "vitest";
import {
  countFinishedBooks,
  dailyTotals,
  dayKey,
  estimateDaysToFinish,
  genreDistribution,
  heatLevel,
  hourHistogram,
  monthStart,
  peakHourWindow,
  readingSpeedPagesPerHour,
  summarizeRange,
  weekStart,
  weekdayHistogram,
  yearStart,
} from "./insights";
import type { ReadingSession, UserBook } from "./types";

function makeSession(overrides: Partial<ReadingSession>): ReadingSession {
  return {
    id: "s",
    bookId: "b",
    startedAt: 0,
    endedAt: 0,
    durationSeconds: 0,
    startPage: 0,
    endPage: 0,
    pagesRead: 0,
    memo: "",
    createdAt: 0,
    ...overrides,
  };
}

function makeUserBook(overrides: Partial<UserBook>): UserBook {
  return {
    bookId: "b",
    status: "reading",
    currentPage: 0,
    startedAt: null,
    finishedAt: null,
    createdAt: 0,
    lastReadAt: 0,
    ...overrides,
  };
}

describe("summarizeRange", () => {
  it("범위 내 세션의 시간/페이지/독서일/세션 수를 집계한다", () => {
    const day1Morning = new Date(2026, 7, 17, 8, 0).getTime();
    const day1Night = new Date(2026, 7, 17, 21, 0).getTime();
    const day2 = new Date(2026, 7, 18, 9, 0).getTime();
    const outside = new Date(2026, 6, 1).getTime();

    const sessions = [
      makeSession({ id: "a", startedAt: day1Morning, durationSeconds: 600, pagesRead: 10 }),
      makeSession({ id: "b", startedAt: day1Night, durationSeconds: 1200, pagesRead: 20 }),
      makeSession({ id: "c", startedAt: day2, durationSeconds: 300, pagesRead: 5 }),
      makeSession({ id: "d", startedAt: outside, durationSeconds: 999, pagesRead: 99 }),
    ];

    const startMs = new Date(2026, 7, 1).getTime();
    const endMs = new Date(2026, 8, 1).getTime();
    const summary = summarizeRange(sessions, startMs, endMs);

    expect(summary.totalSeconds).toBe(2100);
    expect(summary.totalPages).toBe(35);
    expect(summary.readingDays).toBe(2);
    expect(summary.sessionCount).toBe(3);
  });
});

describe("기간 시작 계산", () => {
  it("weekStart는 일요일 자정을 반환한다", () => {
    // 2026-08-18은 화요일 → 그 주 일요일은 8/16
    const start = weekStart(new Date(2026, 7, 18, 15, 30));
    expect(start.getDate()).toBe(16);
    expect(start.getDay()).toBe(0);
    expect(start.getHours()).toBe(0);
  });

  it("monthStart/yearStart는 1일 자정을 반환한다", () => {
    expect(monthStart(new Date(2026, 7, 18)).getDate()).toBe(1);
    expect(yearStart(new Date(2026, 7, 18)).getMonth()).toBe(0);
  });
});

describe("readingSpeedPagesPerHour", () => {
  it("페이지 합 / 시간 합으로 계산한다", () => {
    const sessions = [
      makeSession({ durationSeconds: 1800, pagesRead: 20 }),
      makeSession({ durationSeconds: 1800, pagesRead: 27 }),
    ];
    expect(readingSpeedPagesPerHour(sessions)).toBe(47);
  });

  it("의미 있는 세션이 없으면 0을 반환한다", () => {
    expect(readingSpeedPagesPerHour([])).toBe(0);
    expect(readingSpeedPagesPerHour([makeSession({ durationSeconds: 60, pagesRead: 0 })])).toBe(0);
  });
});

describe("hourHistogram / peakHourWindow", () => {
  it("시작 시각 기준으로 시간대별 초를 누적한다", () => {
    const sessions = [
      makeSession({ startedAt: new Date(2026, 7, 18, 21, 10).getTime(), durationSeconds: 600 }),
      makeSession({ startedAt: new Date(2026, 7, 17, 21, 40).getTime(), durationSeconds: 300 }),
      makeSession({ startedAt: new Date(2026, 7, 16, 8, 0).getTime(), durationSeconds: 100 }),
    ];
    const histogram = hourHistogram(sessions);
    expect(histogram[21]).toBe(900);
    expect(histogram[8]).toBe(100);
  });

  it("가장 많이 읽는 연속 2시간 구간을 찾는다", () => {
    const histogram = Array.from({ length: 24 }, () => 0);
    histogram[21] = 900;
    histogram[22] = 500;
    const peak = peakHourWindow(histogram, 2);
    expect(peak).not.toBeNull();
    expect(peak?.startHour).toBe(21);
    expect(peak?.endHour).toBe(23);
  });

  it("자정을 넘기는 구간도 찾는다", () => {
    const histogram = Array.from({ length: 24 }, () => 0);
    histogram[23] = 900;
    histogram[0] = 800;
    const peak = peakHourWindow(histogram, 2);
    expect(peak?.startHour).toBe(23);
    expect(peak?.endHour).toBe(1);
  });

  it("기록이 없으면 null을 반환한다", () => {
    expect(peakHourWindow(Array.from({ length: 24 }, () => 0))).toBeNull();
  });
});

describe("weekdayHistogram", () => {
  it("요일별 초를 누적한다 (0=일요일)", () => {
    const sessions = [
      // 2026-08-18 = 화요일(2)
      makeSession({ startedAt: new Date(2026, 7, 18, 9, 0).getTime(), durationSeconds: 300 }),
      makeSession({ startedAt: new Date(2026, 7, 16, 9, 0).getTime(), durationSeconds: 200 }),
    ];
    const histogram = weekdayHistogram(sessions);
    expect(histogram[2]).toBe(300);
    expect(histogram[0]).toBe(200);
  });
});

describe("dailyTotals / heatLevel", () => {
  it("같은 날짜의 세션을 합산한다", () => {
    const morning = new Date(2026, 7, 18, 8, 0).getTime();
    const night = new Date(2026, 7, 18, 21, 0).getTime();
    const other = new Date(2026, 7, 17, 9, 0).getTime();
    const totals = dailyTotals([
      makeSession({ startedAt: morning, durationSeconds: 600 }),
      makeSession({ startedAt: night, durationSeconds: 300 }),
      makeSession({ startedAt: other, durationSeconds: 100 }),
    ]);
    expect(totals.get(dayKey(morning))).toBe(900);
    expect(totals.get(dayKey(other))).toBe(100);
  });

  it("독서량을 0-4 강도로 변환한다", () => {
    expect(heatLevel(0)).toBe(0);
    expect(heatLevel(60)).toBe(1);
    expect(heatLevel(20 * 60)).toBe(2);
    expect(heatLevel(60 * 60)).toBe(3);
    expect(heatLevel(2 * 3600)).toBe(4);
  });
});

describe("estimateDaysToFinish", () => {
  const now = new Date(2026, 7, 18, 12, 0).getTime();

  it("최근 30일 페이스로 남은 페이지를 나눠 올림한다", () => {
    // 최근 30일간 150페이지 → 하루 5페이지, 남은 100페이지 → 20일
    const sessions = [
      makeSession({ startedAt: now - 5 * 24 * 3600 * 1000, pagesRead: 150 }),
    ];
    expect(estimateDaysToFinish(sessions, 200, 300, now)).toBe(20);
  });

  it("최근 기록이 없으면 null을 반환한다", () => {
    const old = makeSession({ startedAt: now - 40 * 24 * 3600 * 1000, pagesRead: 100 });
    expect(estimateDaysToFinish([old], 200, 300, now)).toBeNull();
  });

  it("pageCount가 없거나 이미 끝까지 읽었으면 null을 반환한다", () => {
    const sessions = [makeSession({ startedAt: now, pagesRead: 10 })];
    expect(estimateDaysToFinish(sessions, 50, 0, now)).toBeNull();
    expect(estimateDaysToFinish(sessions, 300, 300, now)).toBeNull();
    expect(estimateDaysToFinish(sessions, 0, 300, now)).toBeNull();
  });
});

describe("genreDistribution", () => {
  it("독서 시간을 책 카테고리에 배분해 내림차순으로 반환한다", () => {
    const sessions = [
      makeSession({ bookId: "a", durationSeconds: 600 }),
      makeSession({ bookId: "a", durationSeconds: 300 }),
      makeSession({ bookId: "b", durationSeconds: 200 }),
    ];
    const categories = new Map([
      ["a", ["History"]],
      ["b", ["Science", "History"]],
    ]);
    const result = genreDistribution(sessions, categories);
    expect(result[0]).toEqual({ name: "History", totalSeconds: 1100 });
    expect(result[1]).toEqual({ name: "Science", totalSeconds: 200 });
  });

  it("카테고리 없는 책만 있으면 빈 배열을 반환한다", () => {
    const sessions = [makeSession({ bookId: "a", durationSeconds: 600 })];
    expect(genreDistribution(sessions, new Map())).toEqual([]);
  });

  it("topN 개수만큼 자른다", () => {
    const sessions = [makeSession({ bookId: "a", durationSeconds: 100 })];
    const categories = new Map([["a", ["G1", "G2", "G3"]]]);
    expect(genreDistribution(sessions, categories, 2)).toHaveLength(2);
  });
});

describe("countFinishedBooks", () => {
  it("기간 내 finishedAt이 있는 read 상태만 센다", () => {
    const inRange = new Date(2026, 7, 10).getTime();
    const outside = new Date(2026, 5, 1).getTime();
    const userBooks = [
      makeUserBook({ bookId: "a", status: "read", finishedAt: inRange }),
      makeUserBook({ bookId: "b", status: "read", finishedAt: outside }),
      makeUserBook({ bookId: "c", status: "reading" }),
    ];
    const startMs = new Date(2026, 7, 1).getTime();
    const endMs = new Date(2026, 8, 1).getTime();
    expect(countFinishedBooks(userBooks, startMs, endMs)).toBe(1);
  });
});
