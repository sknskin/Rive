import { describe, expect, it } from "vitest";
import {
  dayRange,
  formatDurationCompact,
  formatDurationShort,
  formatPageRange,
  formatStopwatch,
  formatTimeOfDay,
  greetingForHour,
} from "./format";

describe("formatStopwatch", () => {
  it("0초를 00:00:00으로 표시한다", () => {
    expect(formatStopwatch(0)).toBe("00:00:00");
  });

  it("42분 18초를 00:42:18로 표시한다", () => {
    expect(formatStopwatch(42 * 60 + 18)).toBe("00:42:18");
  });

  it("1시간 이상을 시간 자리로 표시한다", () => {
    expect(formatStopwatch(3600 + 7 * 60 + 5)).toBe("01:07:05");
  });

  it("음수 입력을 0으로 방어한다", () => {
    expect(formatStopwatch(-10)).toBe("00:00:00");
  });
});

describe("formatDurationShort", () => {
  it("1분 미만을 표시한다", () => {
    expect(formatDurationShort(30)).toBe("1분 미만");
  });

  it("분 단위를 표시한다", () => {
    expect(formatDurationShort(42 * 60 + 18)).toBe("42분");
  });

  it("정각 시간을 표시한다", () => {
    expect(formatDurationShort(2 * 3600)).toBe("2시간");
  });

  it("시간+분을 표시한다", () => {
    expect(formatDurationShort(3600 + 7 * 60)).toBe("1시간 7분");
  });
});

describe("formatDurationCompact", () => {
  it("1시간 미만은 분만 표시한다", () => {
    expect(formatDurationCompact(42 * 60)).toBe("42m");
  });

  it("1분 미만은 1m으로 올림 표시한다", () => {
    expect(formatDurationCompact(46)).toBe("1m");
    expect(formatDurationCompact(0)).toBe("0m");
  });

  it("1시간 이상은 h와 0채운 분을 표시한다", () => {
    expect(formatDurationCompact(3600 + 7 * 60)).toBe("1h 07m");
  });
});

describe("formatTimeOfDay", () => {
  it("로컬 시각을 HH:MM으로 표시한다", () => {
    const ms = new Date(2026, 7, 18, 21, 10).getTime();
    expect(formatTimeOfDay(ms)).toBe("21:10");
  });
});

describe("formatPageRange", () => {
  it("페이지 범위를 표시한다", () => {
    expect(formatPageRange(156, 184)).toBe("p.156 → p.184");
  });
});

describe("dayRange", () => {
  it("로컬 자정 기준 하루 범위를 반환한다", () => {
    const { startMs, endMs } = dayRange(new Date(2026, 7, 18, 15, 30));
    expect(new Date(startMs).getHours()).toBe(0);
    expect(endMs - startMs).toBe(24 * 3600 * 1000);
    expect(new Date(startMs).getDate()).toBe(18);
  });
});

describe("greetingForHour", () => {
  it("아침 인사를 반환한다", () => {
    expect(greetingForHour(8)).toBe("좋은 아침이에요");
  });

  it("오후 인사를 반환한다", () => {
    expect(greetingForHour(14)).toBe("좋은 오후예요");
  });

  it("저녁/새벽 인사를 반환한다", () => {
    expect(greetingForHour(22)).toBe("좋은 저녁이에요");
    expect(greetingForHour(2)).toBe("좋은 저녁이에요");
  });
});
