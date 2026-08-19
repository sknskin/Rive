// 도메인 타입 정의 — 서비스 전역에서 공유한다
// Domain type definitions — shared across the app

export type BookStatus = "reading" | "want" | "read" | "paused" | "dnf";

export interface Book {
  id: string;
  title: string;
  authors: string[];
  publisher: string;
  isbn13: string;
  coverUrl: string;
  pageCount: number;
  kakaoUrl: string;
  googleBooksId: string;
  createdAt: number;
  // 메타 보강 필드 — Kakao 응답에 없는 정보를 Google Books에서 병합 (스펙 §22, §33, §72)
  // Enrichment fields — merged from Google Books where Kakao lacks data (spec §22, §33, §72)
  description?: string;
  categories?: string[];
  enrichedAt?: number;
}

export interface UserBook {
  bookId: string;
  status: BookStatus;
  currentPage: number;
  startedAt: number | null;
  finishedAt: number | null;
  createdAt: number;
  lastReadAt: number;
  // 완독 별점(1–5)과 중단 사유 — AI 취향 분석의 핵심 데이터 (스펙 §25–26)
  // Finished rating (1–5) and DNF reason — key data for AI taste analysis (spec §25–26)
  rating?: number;
  dnfReason?: string;
  // 완독 추가 평가(재미/몰입도/난이도, 각 1–5) — 선택 입력 (스펙 §25)
  // Optional extra finish ratings (fun/immersion/difficulty, 1–5 each) (spec §25)
  extraRatings?: { fun?: number; immersion?: number; difficulty?: number };
  // Up Next 지정 시각 — 존재하면 다음에 읽을 책 (스펙 §37)
  // Up Next timestamp — present means queued to read next (spec §37)
  upNextAt?: number;
  // 완독 목표일 (Reading Plan, 스펙 §82)
  // Target finish date (reading plan, spec §82)
  targetDate?: number;
}

// 자유 노트와 인용구 (스펙 §27)
// Free-form notes and quotes (spec §27)
export interface BookNote {
  id: string;
  bookId: string;
  content: string;
  createdAt: number;
}

export interface BookQuote {
  id: string;
  bookId: string;
  page: number;
  quote: string;
  comment: string;
  createdAt: number;
}

// 연간 독서 목표 — 0은 미설정 (스펙 §36)
// Annual reading goals — 0 means unset (spec §36)
export interface ReadingGoals {
  id: "current";
  year: number;
  targetBooks: number;
  targetPages: number;
  targetHours: number;
  updatedAt: number;
}

// 월간/연간 리캡의 AI 요약 캐시 — id는 '2026-08' 또는 '2026' (스펙 §58)
// Cached AI summary for monthly/annual wrapped — id like '2026-08' or '2026' (spec §58)
export interface WrappedSummary {
  id: string;
  summary: string;
  generatedAt: number;
}

export interface ReadingSession {
  id: string;
  bookId: string;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  startPage: number;
  endPage: number;
  pagesRead: number;
  memo: string;
  createdAt: number;
}

export interface ActiveSession {
  // 진행 중 세션은 항상 1건이므로 고정 키를 사용한다
  // A single in-progress session exists at most, so a fixed key is used
  id: "active";
  bookId: string;
  startedAt: number;
  startPage: number;
}

export interface BookSearchResult {
  title: string;
  authors: string[];
  publisher: string;
  isbn13: string;
  coverUrl: string;
  pageCount: number;
  kakaoUrl: string;
  googleBooksId: string;
  description?: string;
}

export interface BookSearchResponse {
  results: BookSearchResult[];
  source: "kakao" | "google";
}

// 온보딩에서 선택한 실제 책 참조 — Free Text 대신 검색 결과 선택 (스펙 §42)
// Real-book reference chosen during onboarding — picked from search, not free text (spec §42)
export interface BookRef {
  title: string;
  authors: string[];
  isbn13: string;
  coverUrl: string;
}

export type FictionPreference = "fiction" | "nonfiction" | "both";

// 온보딩 설문 답변 — 항상 1건만 존재 (스펙 §38–43)
// Onboarding preference answers — single record (spec §38–43)
export interface PreferenceProfile {
  id: "primary";
  favoriteGenres: string[];
  dislikedGenres: string[];
  lovedBooks: BookRef[];
  dislikedBooks: BookRef[];
  fictionPreference: FictionPreference;
  readingPurposes: string[];
  // 선택 응답 — 추천 가중치는 낮게 유지 (스펙 §40–41)
  // Optional answers — kept low-weight in recommendations (spec §40–41)
  ageRange?: string;
  gender?: string;
  updatedAt: number;
}

// Reading DNA 4축 (0–100, 스펙 §55)
// Four reading-DNA axes (0–100, spec §55)
export interface ReadingDna {
  fiction: number;
  depth: number;
  emotion: number;
  exploration: number;
}

interface AiGenreScore {
  name: string;
  score: number;
}

// AI 취향 분석 결과 캐시 — 다시 분석 전까지 재사용 (스펙 §44–45, §65)
// Cached AI taste analysis — reused until re-analysis (spec §44–45, §65)
export interface AiProfile {
  id: "current";
  profileType: string;
  summary: string;
  genres: AiGenreScore[];
  traits: string[];
  recommendationFactors: string[];
  evidence: string[];
  // 취향 변화 서술(§47), DNA 4축(§55), Book Twin(§57) — 분석 1회에 함께 생성
  // Taste changes (§47), DNA axes (§55), book twin (§57) — produced in one analysis
  tasteChanges?: string[];
  dna?: ReadingDna;
  bookTwin?: { title: string; reason: string };
  analyzedAt: number;
}

export type RecommendationStatus =
  | "active"
  | "want"
  | "liked"
  | "notInterested"
  | "alreadyRead";

// AI 추천 캐시 + 피드백 상태 (스펙 §48–50, §76)
// Cached AI recommendation with feedback state (spec §48–50, §76)
export interface AiRecommendation {
  id: string;
  book: BookSearchResult;
  matchPercent: number;
  reason: string;
  // 추천 카테고리 — For You / Because You Loved / Quick Read 등 (스펙 §52)
  // Recommendation category (spec §52)
  category?: string;
  generatedAt: number;
  status: RecommendationStatus;
  feedbackReason?: string;
}
