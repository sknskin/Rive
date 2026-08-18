import type { BookSearchResult, BookStatus, FictionPreference } from "@/lib/types";

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
}

export interface BehaviorSnapshot {
  books: BehaviorBookEntry[];
  totalSessions: number;
  totalMinutes: number;
  readingSpeedPagesPerHour: number;
  peakHours: string | null;
}

export interface PreferencePayload {
  favoriteGenres: string[];
  dislikedGenres: string[];
  lovedBooks: { title: string; authors: string[] }[];
  dislikedBooks: { title: string; authors: string[] }[];
  fictionPreference: FictionPreference;
  readingPurposes: string[];
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
}

export interface RecommendRequest {
  preference: PreferencePayload;
  behavior: BehaviorSnapshot;
  profile: ProfileResponse;
  // 이미 서재에 있거나 피드백으로 거른 책은 후보에서 제외한다
  // Exclude books already in the library or filtered by feedback
  excludeTitles: string[];
}

export interface RecommendItem {
  book: BookSearchResult;
  matchPercent: number;
  reason: string;
}

export interface RecommendResponse {
  items: RecommendItem[];
}

export interface AiErrorResponse {
  error: string;
  missingKey?: boolean;
}
