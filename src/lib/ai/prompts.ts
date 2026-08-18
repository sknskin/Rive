import type { GeminiSchema } from "./gemini";
import type { ProfileRequest, RecommendRequest } from "./contracts";
import type { BookSearchResult } from "@/lib/types";
import { RECOMMENDATION_COUNT } from "@/lib/constants";

// Gemini 프롬프트/스키마 정의 — AI의 역할은 Analyze/Rank/Explain뿐 (스펙 §51, §67)
// Gemini prompts/schemas — the AI only analyzes, ranks, and explains (spec §51, §67)

export const PROFILE_SCHEMA: GeminiSchema = {
  type: "OBJECT",
  properties: {
    profileType: { type: "STRING", description: "독서가 유형 이름, 예: 탐구형 독서가" },
    summary: { type: "STRING", description: "2~3문장의 자연스러운 한국어 요약" },
    genres: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          score: { type: "INTEGER", description: "0-100 선호 점수" },
        },
        required: ["name", "score"],
      },
    },
    traits: { type: "ARRAY", items: { type: "STRING" } },
    recommendationFactors: { type: "ARRAY", items: { type: "STRING" } },
    evidence: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "분석 근거 — 실제 입력 데이터에서만 인용",
    },
  },
  required: ["profileType", "summary", "genres", "traits", "recommendationFactors", "evidence"],
};

export function buildProfilePrompt(request: ProfileRequest): string {
  return [
    "당신은 독서 취향 분석가다. 아래 사용자의 설문과 실제 독서 기록을 분석해 Reading Profile을 만든다.",
    "규칙:",
    "- 반드시 제공된 데이터에서만 근거(evidence)를 인용한다. 데이터를 지어내지 않는다.",
    "- 실제 독서 행동(완독, 중단, 별점)이 설문 답변보다 중요하다.",
    "- 모든 텍스트는 자연스러운 한국어로 쓴다. 부정적이거나 압박하는 표현은 피한다.",
    "- genres는 선호 상위 3~6개 장르만 담는다.",
    "",
    "## 설문 답변",
    JSON.stringify(request.preference, null, 2),
    "",
    "## 실제 독서 기록",
    JSON.stringify(request.behavior, null, 2),
  ].join("\n");
}

export const QUERIES_SCHEMA: GeminiSchema = {
  type: "OBJECT",
  properties: {
    queries: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "도서 검색 API에 넣을 한국어 검색어 4~6개",
    },
  },
  required: ["queries"],
};

export function buildQueriesPrompt(request: RecommendRequest): string {
  return [
    "당신은 도서 큐레이터다. 아래 사용자 프로필을 바탕으로, 한국 도서 검색 API(카카오 책 검색)에 넣을 검색어를 만들어라.",
    "규칙:",
    "- 검색어는 장르/주제/작가 중심의 짧은 한국어 키워드로 만든다. 예: '과학 교양', '역사 논픽션', '칼 세이건'.",
    "- 특정 책 제목을 지어내지 않는다. 검색어만 만든다.",
    "- 사용자가 싫어하는 장르는 피한다.",
    "- 서로 다른 각도의 검색어 4~6개를 만든다 (선호 장르 심화 + 인접 확장 1개 포함).",
    "",
    "## Reading Profile",
    JSON.stringify(request.profile, null, 2),
    "",
    "## 설문 답변",
    JSON.stringify(request.preference, null, 2),
  ].join("\n");
}

export const RANK_SCHEMA: GeminiSchema = {
  type: "OBJECT",
  properties: {
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          index: { type: "INTEGER", description: "후보 목록의 0-based 인덱스" },
          matchPercent: { type: "INTEGER", description: "60-99 사이의 매치 점수" },
          reason: {
            type: "STRING",
            description: "사용자 데이터에 근거한 1~2문장의 한국어 추천 이유",
          },
        },
        required: ["index", "matchPercent", "reason"],
      },
    },
  },
  required: ["items"],
};

export function buildRankPrompt(
  request: RecommendRequest,
  candidates: BookSearchResult[],
): string {
  const candidateLines = candidates.map((candidate, index) => ({
    index,
    title: candidate.title,
    authors: candidate.authors,
    publisher: candidate.publisher,
  }));

  return [
    "당신은 개인화 도서 추천가다. 아래 실제 도서 후보 중에서 사용자에게 가장 잘 맞는 책을 고른다.",
    "규칙:",
    `- 반드시 후보 목록 안에서만 고른다. 정확히 ${RECOMMENDATION_COUNT}권 (후보가 부족하면 가능한 만큼).`,
    "- 같은 책의 다른 판본(제목이 거의 같은 후보)은 하나만 고른다.",
    "- reason은 사용자의 설문/기록/프로필을 근거로 쓴다. 예: '사피엔스를 5점 평가한 취향과 맞닿아 있어요.'",
    "- 사용자가 싫어하는 장르, 별로였던 책과 비슷한 책은 제외한다.",
    "- matchPercent는 근거 강도에 따라 60~99 사이로 차등을 둔다.",
    "",
    "## 후보 도서 목록",
    JSON.stringify(candidateLines, null, 2),
    "",
    "## Reading Profile",
    JSON.stringify(request.profile, null, 2),
    "",
    "## 설문 답변",
    JSON.stringify(request.preference, null, 2),
    "",
    "## 실제 독서 기록",
    JSON.stringify(request.behavior, null, 2),
  ].join("\n");
}
