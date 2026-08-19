import type { BookSearchResult, BookStatus, FictionPreference, ReadingDna } from "@/lib/types";

// AI 라우트와 클라이언트가 공유하는 요청/응답 계약
// Request/response contracts shared by AI routes and the client

// AI에 보내는 데이터는 책/독서 행동 정보만 — 개인 식별 정보 금지 (스펙 §69)
// Only book/reading-behavior data goes to the AI — no personal identifiers (spec §69)
export interface BehaviorBookEntry {
  title: string;
  authors: string[];
  status: BookStatus;
  rating?: number;
  dnfReason?: string;
  // 완독 추가 평가 — 재미/몰입도/난이도 (스펙 §25 취향 분석 입력)
  // Extra finish ratings — fun/immersion/difficulty (spec §25 taste-analysis input)
  extraRatings?: { fun?: number; immersion?: number; difficulty?: number };
}

export interface BehaviorSnapshot {
  books: BehaviorBookEntry[];
  totalSessions: number;
  totalMinutes: number;
  readingSpeedPagesPerHour: number;
  peakHours: string | null;
  // 추천 피드백 신호 — 좋아요/거절 사유 (스펙 §50 학습 데이터)
  // Recommendation feedback signals — likes and rejection reasons (spec §50)
  likedBooks: string[];
  notInterested: { title: string; reason: string }[];
}

export interface PreferencePayload {
  favoriteGenres: string[];
  dislikedGenres: string[];
  lovedBooks: { title: string; authors: string[] }[];
  dislikedBooks: { title: string; authors: string[] }[];
  fictionPreference: FictionPreference;
  readingPurposes: string[];
  ageRange?: string;
  gender?: string;
}

export interface ProfileRequest {
  preference: PreferencePayload;
  behavior: BehaviorSnapshot;
}

export interface ProfileResponse {
  profileType: string;
  summary: string;
  genres: { name: string; score: number }[];
  traits: string[];
  recommendationFactors: string[];
  evidence: string[];
  // 취향 변화(§47), DNA 4축(§55), Book Twin(§57) — 서재 책 중에서만 선정
  // Taste changes (§47), DNA axes (§55), book twin (§57, shelf books only)
  tasteChanges: string[];
  dna: ReadingDna;
  bookTwin: { title: string; reason: string };
}

export interface RecommendRequest {
  preference: PreferencePayload;
  behavior: BehaviorSnapshot;
  profile: ProfileResponse;
  // 이미 서재에 있거나 피드백으로 거른 책은 후보에서 제외한다
  // Exclude books already in the library or filtered by feedback
  excludeTitles: string[];
  // 상황 맞춤 힌트 — 기분/가용 시간 (스펙 §53–54)
  // Contextual hints — mood and available time (spec §53–54)
  mood?: string;
  timeAvailable?: string;
}

export interface RecommendItem {
  book: BookSearchResult;
  matchPercent: number;
  reason: string;
  category: string;
}

export interface RecommendResponse {
  items: RecommendItem[];
}

export interface AiErrorResponse {
  error: string;
  missingKey?: boolean;
}
