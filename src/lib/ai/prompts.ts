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
    tasteChanges: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "최근 취향 변화 서술 0~3개 — 데이터가 부족하면 빈 배열",
    },
    dna: {
      type: "OBJECT",
      description: "Reading DNA 0-100. fiction: 0=논픽션 100=픽션, depth: 0=가볍게 100=깊게, emotion: 0=분석적 100=감성적, exploration: 0=익숙한 것 100=탐험적",
      properties: {
        fiction: { type: "INTEGER" },
        depth: { type: "INTEGER" },
        emotion: { type: "INTEGER" },
        exploration: { type: "INTEGER" },
      },
      required: ["fiction", "depth", "emotion", "exploration"],
    },
    bookTwin: {
      type: "OBJECT",
      description: "현재 취향을 가장 잘 대표하는 책 1권 — 반드시 '실제 독서 기록'의 books 목록에 있는 제목만 사용, 없으면 title을 빈 문자열로",
      properties: {
        title: { type: "STRING" },
        reason: { type: "STRING" },
      },
      required: ["title", "reason"],
    },
  },
  required: [
    "profileType",
    "summary",
    "genres",
    "traits",
    "recommendationFactors",
    "evidence",
    "tasteChanges",
    "dna",
    "bookTwin",
  ],
};

export function buildProfilePrompt(request: ProfileRequest): string {
  return [
    "당신은 독서 취향 분석가다. 아래 사용자의 설문과 실제 독서 기록을 분석해 Reading Profile을 만든다.",
    "규칙:",
    "- 반드시 제공된 데이터에서만 근거(evidence)를 인용한다. 데이터를 지어내지 않는다.",
    "- 실제 독서 행동(완독, 중단, 별점)이 설문 답변보다 중요하다. 나이/성별은 있어도 가장 낮은 가중치로만 쓴다.",
    "- extraRatings는 완독 후 추가 평가로, fun(재미)·immersion(몰입도)·difficulty(난이도) 각각 1~5점이다. fun/immersion은 높을수록 만족을 뜻하고, difficulty는 높을수록 어려웠다는 뜻일 뿐 선호도가 아니다.",
    "- 모든 텍스트는 자연스러운 한국어로 쓴다. 부정적이거나 압박하는 표현은 피한다.",
    "- genres는 선호 상위 3~6개 장르만 담는다.",
    "- tasteChanges는 시간에 따른 변화가 데이터로 보일 때만 쓴다(없으면 빈 배열).",
    "- bookTwin은 반드시 '실제 독서 기록'의 books 목록에 존재하는 제목이어야 한다. 서재가 비었으면 title을 빈 문자열로 둔다.",
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
  const contextLines: string[] = [];
  if (request.mood) {
    contextLines.push(`- 지금 사용자의 기분/원하는 것: "${request.mood}" — 검색어에 반영하라.`);
  }
  if (request.timeAvailable) {
    contextLines.push(
      `- 가용 독서 시간: "${request.timeAvailable}" — 짧으면 얇고 가벼운 책 위주로.`,
    );
  }

  return [
    "당신은 도서 큐레이터다. 아래 사용자 프로필을 바탕으로, 한국 도서 검색 API(카카오 책 검색)에 넣을 검색어를 만들어라.",
    "규칙:",
    "- 검색어는 장르/주제/작가 중심의 짧은 한국어 키워드로 만든다. 예: '과학 교양', '역사 논픽션', '칼 세이건'.",
    "- 특정 책 제목을 지어내지 않는다. 검색어만 만든다.",
    "- 사용자가 싫어하는 장르는 피한다.",
    "- 서로 다른 각도의 검색어 4~6개를 만든다 (선호 장르 심화 + 인접 확장 1개 포함).",
    ...contextLines,
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
          category: {
            type: "STRING",
            description:
              "추천 카테고리 — 'For You', 'Because You Loved', 'Something Different', 'Quick Read' 중 하나",
          },
        },
        required: ["index", "matchPercent", "reason", "category"],
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
    "- 사용자가 싫어하는 장르, 별로였던 책과 비슷한 책, 관심 없음 사유에 걸리는 책은 제외한다.",
    "- matchPercent는 근거 강도에 따라 60~99 사이로 차등을 둔다.",
    "- category는 각 추천의 성격에 맞게 배정한다: 취향 정중앙이면 'For You', 특정 애독서와의 연결이 뚜렷하면 'Because You Loved', 취향을 넓히는 모험이면 'Something Different', 짧고 가볍게 읽히면 'Quick Read'.",
    ...(request.mood ? [`- 지금 사용자의 기분: "${request.mood}" — 이에 맞는 책을 우선한다.`] : []),
    ...(request.timeAvailable
      ? [`- 가용 시간: "${request.timeAvailable}" — 분량을 고려한다.`]
      : []),
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
