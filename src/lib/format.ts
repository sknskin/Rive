// 시간/페이지 표시 포맷 유틸 — AI 없이 계산하는 영역
// Time/page formatting utilities — computed without AI

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const SECONDS_PER_HOUR = SECONDS_PER_MINUTE * MINUTES_PER_HOUR;

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

  if (safe === 0) {
    return "0분";
  }
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

// 시간대 6구간 인사말 — 문구는 날짜별로 로테이션되어 매일 달라진다 (스펙 §86 차분한 톤)
// Six time-slot greetings — phrases rotate daily (spec §86 calm tone)
interface GreetingSlot {
  startHour: number;
  endHour: number;
  phrases: string[];
}

const GREETING_SLOTS: GreetingSlot[] = [
  {
    startHour: 0,
    endHour: 5,
    phrases: ["고요한 새벽, 한 페이지 어때요", "새벽 감성엔 역시 책이죠", "모두 잠든 시간, 나만의 독서"],
  },
  {
    startHour: 5,
    endHour: 11,
    phrases: ["좋은 아침, 오늘의 첫 페이지를 펼쳐요", "상쾌한 아침, 활자로 시작해요", "아침 공기와 책, 완벽한 조합"],
  },
  {
    startHour: 11,
    endHour: 14,
    phrases: ["점심 틈새 독서, 은근 꿀맛이에요", "바쁜 하루, 잠깐 쉬어가는 페이지", "한낮의 잠깐, 책 한 모금"],
  },
  {
    startHour: 14,
    endHour: 18,
    phrases: ["나른한 오후엔 책이 딱이에요", "오후의 집중력, 책으로 채워요", "커피 한 잔과 책 몇 장 어때요"],
  },
  {
    startHour: 18,
    endHour: 22,
    phrases: ["오늘 하루 수고했어요, 이제 책 타임", "저녁의 여유, 책과 함께해요", "하루를 닫는 가장 좋은 방법, 독서"],
  },
  {
    startHour: 22,
    endHour: 24,
    phrases: ["잠들기 전, 딱 몇 장만 더", "하루의 끝, 조용히 책장을 넘겨요", "오늘 밤은 책과 함께 마무리"],
  },
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function greetingForDate(date: Date): string {
  const hour = date.getHours();
  const slot =
    GREETING_SLOTS.find(
      (candidate) => hour >= candidate.startHour && hour < candidate.endHour,
    ) ?? GREETING_SLOTS[0];
  // 날짜 인덱스로 문구를 순환시켜 같은 시간대라도 매일 다른 문구가 나온다
  // Rotate by day index so the same slot shows a different phrase each day
  const dayIndex = Math.floor(date.getTime() / MS_PER_DAY);
  return slot.phrases[dayIndex % slot.phrases.length];
}
