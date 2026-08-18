import type { BookStatus } from "@/lib/types";

// 앱 전역 상수 — 매직 넘버/스트링을 한곳에서 관리한다
// App-wide constants — keep magic numbers/strings in one place

export const DB_NAME = "rive";
export const DEFAULT_START_PAGE = 1;
export const SEARCH_DEBOUNCE_MS = 300;
export const SEARCH_RESULT_SIZE = 10;
export const ACTIVE_SESSION_ID = "active" as const;

// 이 시간(초) 미만의 세션은 오조작 가능성이 높아 저장 전에 확인한다
// Sessions shorter than this (seconds) are likely accidental; confirm before saving
export const MIN_SESSION_SECONDS = 5;

// Library 상태 표시 순서와 한글 라벨 (스펙 §21)
// Library status display order and Korean labels (spec §21)
export const STATUS_ORDER: BookStatus[] = ["reading", "want", "read", "paused", "dnf"];

export const STATUS_LABELS: Record<BookStatus, string> = {
  reading: "읽는 중",
  want: "읽고 싶은",
  read: "다 읽은",
  paused: "잠시 멈춤",
  dnf: "중단",
};

// DNF 사유 선택지 (스펙 §26)
// DNF reason options (spec §26)
export const DNF_REASONS = [
  "재미없음",
  "너무 어려움",
  "너무 김",
  "기대와 다름",
  "지금 읽고 싶지 않음",
  "작가가 취향이 아님",
  "나중에 다시 읽을 예정",
  "기타",
] as const;

export const RATING_MAX = 5;

// Reading Speed 계산에 사용할 최근 기간 (스펙 §34)
// Recent window used for reading-speed calculation (spec §34)
export const READING_SPEED_WINDOW_DAYS = 30;

// 시간대 분석에서 찾을 최다 독서 구간의 길이 (스펙 §31)
// Length of the peak reading window for time-of-day analysis (spec §31)
export const PEAK_WINDOW_HOURS = 2;

// 온보딩 장르 선택지 (스펙 §40)
// Onboarding genre options (spec §40)
export const GENRE_OPTIONS = [
  "소설",
  "에세이",
  "인문",
  "역사",
  "과학",
  "철학",
  "심리",
  "자기계발",
  "경제·경영",
  "SF",
  "판타지",
  "추리·스릴러",
  "로맨스",
  "시",
  "예술",
  "여행",
] as const;

// 독서 목적 선택지 (스펙 §40)
// Reading purpose options (spec §40)
export const READING_PURPOSE_OPTIONS = [
  "새로운 지식",
  "휴식과 위로",
  "재미와 몰입",
  "성장과 자기계발",
  "생각할 거리",
  "습관 만들기",
] as const;

// 추천 거절 사유 (스펙 §50)
// Not-interested reasons (spec §50)
export const NOT_INTERESTED_REASONS = [
  "이미 읽었어요",
  "장르가 취향이 아님",
  "너무 길어요",
  "너무 어려워요",
  "작가가 취향이 아님",
  "지금은 읽고 싶지 않음",
] as const;

// 추천 개수와 캐시 레코드 고정 키
// Recommendation count and fixed cache record keys
export const RECOMMENDATION_COUNT = 5;
export const PREFERENCE_PROFILE_ID = "primary" as const;
export const AI_PROFILE_ID = "current" as const;
