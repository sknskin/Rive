// 시간/페이지 표시 포맷 유틸 — AI 없이 계산하는 영역
// Time/page formatting utilities — computed without AI

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const SECONDS_PER_HOUR = SECONDS_PER_MINUTE * MINUTES_PER_HOUR;

const MORNING_START_HOUR = 5;
const AFTERNOON_START_HOUR = 12;
const EVENING_START_HOUR = 18;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

// '00:42:18' — 스톱워치 표시
// '00:42:18' — stopwatch display
export function formatStopwatch(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / SECONDS_PER_HOUR);
  const minutes = Math.floor((safe % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const seconds = safe % SECONDS_PER_MINUTE;
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
}

// '42분' | '1시간 7분' — 요약 표시
// '42분' | '1시간 7분' — summary display
export function formatDurationShort(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / SECONDS_PER_HOUR);
  const minutes = Math.floor((safe % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);

  if (hours === 0 && minutes === 0) {
    return "1분 미만";
  }
  if (hours === 0) {
    return `${minutes}분`;
  }
  if (minutes === 0) {
    return `${hours}시간`;
  }
  return `${hours}시간 ${minutes}분`;
}

// '42m' | '1h 07m' — 캘린더 셀처럼 좁은 공간용 컴팩트 표시
// '42m' | '1h 07m' — compact display for tight spaces like calendar cells
export function formatDurationCompact(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / SECONDS_PER_HOUR);
  const minutes = Math.floor((safe % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);

  if (hours === 0) {
    // 1분 미만 기록도 활동이 보이도록 1분으로 올림 표시한다
    // Round sub-minute records up to 1m so the activity stays visible
    return safe > 0 ? `${Math.max(1, minutes)}m` : "0m";
  }
  return `${hours}h ${pad2(minutes)}m`;
}

// '21:10' — 로컬 시각 표시
// '21:10' — local time-of-day display
export function formatTimeOfDay(ms: number): string {
  const date = new Date(ms);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

// 'p.156 → p.184'
export function formatPageRange(startPage: number, endPage: number): string {
  return `p.${startPage} → p.${endPage}`;
}

// 로컬 자정 기준 하루 범위 [startMs, endMs)
// One-day range based on local midnight [startMs, endMs)
export function dayRange(date: Date): { startMs: number; endMs: number } {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

// '2026-08-18' — <input type="date">용 로컬 날짜 값
// '2026-08-18' — local date value for <input type="date">
export function formatDateInput(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

// '8월 18일' — 세션 타임라인 등 간단 날짜 표시
// '8월 18일' — short date display for timelines
export function formatShortDate(ms: number): string {
  const date = new Date(ms);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

// 시간대별 인사말 — 압박하지 않는 차분한 톤 (스펙 §86)
// Greeting by hour — calm tone without pressure (spec §86)
export function greetingForHour(hour: number): string {
  if (hour >= MORNING_START_HOUR && hour < AFTERNOON_START_HOUR) {
    return "좋은 아침이에요";
  }
  if (hour >= AFTERNOON_START_HOUR && hour < EVENING_START_HOUR) {
    return "좋은 오후예요";
  }
  return "좋은 저녁이에요";
}
