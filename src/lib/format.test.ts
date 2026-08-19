import { describe, expect, it } from "vitest";
import {
  dayRange,
  formatDurationCompact,
  formatDurationShort,
  formatPageRange,
  formatStopwatch,
  formatTimeOfDay,
  greetingForDate,
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
  it("0초는 0분으로 표시한다", () => {
    expect(formatDurationShort(0)).toBe("0분");
  });

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

describe("greetingForDate", () => {
  it("시간대마다 항상 문자열 문구를 반환한다", () => {
    for (let hour = 0; hour < 24; hour++) {
      const phrase = greetingForDate(new Date(2026, 7, 18, hour, 0));
      expect(phrase.length).toBeGreaterThan(0);
    }
  });

  it("같은 시간대라도 날짜가 다르면 문구가 로테이션된다", () => {
    const day1 = greetingForDate(new Date(2026, 7, 18, 9, 0));
    const day2 = greetingForDate(new Date(2026, 7, 19, 9, 0));
    const day3 = greetingForDate(new Date(2026, 7, 20, 9, 0));
    // 문구 풀이 3개이므로 연속 3일 중 최소 2개는 서로 달라야 한다
    const unique = new Set([day1, day2, day3]);
    expect(unique.size).toBeGreaterThan(1);
  });

  it("낮 시간(14시)에 저녁 문구가 나오지 않는다", () => {
    const phrase = greetingForDate(new Date(2026, 7, 18, 14, 0));
    expect(phrase).not.toContain("저녁");
    expect(phrase).not.toContain("밤");
  });
});
