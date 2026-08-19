import type {
  AiErrorResponse,
  RecommendItem,
  RecommendRequest,
  RecommendResponse,
} from "@/lib/ai/contracts";
import { dedupeCandidates, normalizeTitle } from "@/lib/ai/candidates";
import { generateJson } from "@/lib/ai/gemini";
import {
  buildQueriesPrompt,
  buildRankPrompt,
  QUERIES_SCHEMA,
  RANK_SCHEMA,
} from "@/lib/ai/prompts";
import { searchGoogleBooks } from "@/lib/bookSearch/googleBooks";
import { searchKakao } from "@/lib/bookSearch/kakao";
import { RECOMMENDATION_COUNT } from "@/lib/constants";
import { getUserFromRequest } from "@/lib/supabase/serverAuth";
import type { BookSearchResult } from "@/lib/types";

const STATUS_UNAUTHORIZED = 401;
// 비용 어뷰징 방지 상한 — 본문 크기와 제외 목록 길이 (6차 조사 B1)
// Abuse caps — request-body size and exclude-list length (audit 6 B1)
const MAX_BODY_CHARS = 200_000;
const MAX_EXCLUDE_TITLES = 300;

const STATUS_BAD_REQUEST = 400;
const STATUS_SERVICE_UNAVAILABLE = 503;
const STATUS_BAD_GATEWAY = 502;

// 후보가 너무 많으면 랭킹 프롬프트가 비대해지므로 상한을 둔다
// Cap candidates so the ranking prompt stays small
const MAX_CANDIDATES = 24;
const MATCH_PERCENT_MIN = 60;
const MATCH_PERCENT_MAX = 99;

interface QueriesResponse {
  queries: string[];
}

interface RankResponse {
  items: { index: number; matchPercent: number; reason: string; category: string }[];
}

const RECOMMEND_CATEGORIES = [
  "For You",
  "Because You Loved",
  "Something Different",
  "Quick Read",
];
const DEFAULT_CATEGORY = "For You";

async function searchBooks(query: string): Promise<BookSearchResult[]> {
  const kakaoKey = process.env.KAKAO_REST_API_KEY;
  if (kakaoKey) {
    try {
      return await searchKakao(query, kakaoKey);
    } catch (error) {
      console.error("[ai/recommend] kakao search failed, falling back:", error);
    }
  }
  return searchGoogleBooks(query);
}

// AI 추천 — 키워드 생성(Gemini) → 실제 도서 검색(API) → 랭킹+설명(Gemini) (스펙 §51)
// AI recommendation — queries (Gemini) → real book search (API) → rank + explain (Gemini) (spec §51)
export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const body: AiErrorResponse = {
      error: "AI 추천을 사용하려면 .env.local에 GEMINI_API_KEY를 추가해 주세요.",
      missingKey: true,
    };
    return Response.json(body, { status: STATUS_SERVICE_UNAVAILABLE });
  }

  // 로그인 사용자만 AI 호출 가능 — 요청 1회 = Gemini 2회 + 검색 다회라 게이트가 필수 (6차 B1)
  // Signed-in users only — one request costs two Gemini calls plus searches (audit 6 B1)
  const user = await getUserFromRequest(request);
  if (!user) {
    return Response.json(
      { error: "AI 추천은 로그인 후 사용할 수 있어요. 설정에서 로그인해 주세요." } satisfies AiErrorResponse,
      { status: STATUS_UNAUTHORIZED },
    );
  }

  let payload: RecommendRequest;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_CHARS) {
      return Response.json(
        { error: "요청이 너무 커요." } satisfies AiErrorResponse,
        { status: STATUS_BAD_REQUEST },
      );
    }
    payload = JSON.parse(raw) as RecommendRequest;
  } catch {
    return Response.json(
      { error: "잘못된 요청이에요." } satisfies AiErrorResponse,
      { status: STATUS_BAD_REQUEST },
    );
  }

  if (!payload.preference || !payload.profile) {
    return Response.json(
      { error: "추천에 필요한 데이터가 없어요." } satisfies AiErrorResponse,
      { status: STATUS_BAD_REQUEST },
    );
  }

  // 제외 목록 길이 상한 — 프롬프트 크기 폭주 방지
  // Cap the exclude list to keep the prompt bounded
  if (payload.excludeTitles && payload.excludeTitles.length > MAX_EXCLUDE_TITLES) {
    payload.excludeTitles = payload.excludeTitles.slice(0, MAX_EXCLUDE_TITLES);
  }

  try {
    // 1단계: 취향 기반 검색 키워드 생성 — 책 제목을 만들지 않는다
    // Step 1: taste-based search queries — never invented book titles
    const { queries } = await generateJson<QueriesResponse>(
      apiKey,
      buildQueriesPrompt(payload),
      QUERIES_SCHEMA,
    );
    if (!queries || queries.length === 0) {
      throw new Error("gemini returned no search queries");
    }

    // 2단계: 실제 도서 API에서 후보 수집 (일부 실패는 허용)
    // Step 2: gather real candidates from book APIs (partial failures tolerated)
    const settled = await Promise.allSettled(queries.map((query) => searchBooks(query)));
    const lists = settled
      .filter(
        (result): result is PromiseFulfilledResult<BookSearchResult[]> =>
          result.status === "fulfilled",
      )
      .map((result) => result.value);

    const candidates = dedupeCandidates(lists, payload.excludeTitles ?? []).slice(
      0,
      MAX_CANDIDATES,
    );
    if (candidates.length === 0) {
      return Response.json(
        { error: "추천할 만한 책을 찾지 못했어요. 잠시 후 다시 시도해 주세요." } satisfies AiErrorResponse,
        { status: STATUS_BAD_GATEWAY },
      );
    }

    // 3단계: 후보 내에서만 랭킹 + 추천 이유 생성
    // Step 3: rank within candidates only, with explanations
    const rank = await generateJson<RankResponse>(
      apiKey,
      buildRankPrompt(payload, candidates),
      RANK_SCHEMA,
    );

    const seenTitles = new Set<string>();
    const items: RecommendItem[] = [];
    for (const entry of rank.items ?? []) {
      const book = candidates[entry.index];
      if (!book) {
        continue;
      }
      const titleKey = normalizeTitle(book.title);
      if (seenTitles.has(titleKey)) {
        continue;
      }
      seenTitles.add(titleKey);
      items.push({
        book,
        matchPercent: Math.min(
          MATCH_PERCENT_MAX,
          Math.max(MATCH_PERCENT_MIN, Math.round(entry.matchPercent)),
        ),
        reason: entry.reason,
        // 정의된 카테고리 외 값은 기본 카테고리로 정규화한다
        // Normalize out-of-list categories to the default
        category: RECOMMEND_CATEGORIES.includes(entry.category)
          ? entry.category
          : DEFAULT_CATEGORY,
      });
      if (items.length >= RECOMMENDATION_COUNT) {
        break;
      }
    }

    if (items.length === 0) {
      throw new Error("gemini ranked no valid candidates");
    }

    const body: RecommendResponse = { items };
    return Response.json(body);
  } catch (error) {
    console.error("[ai/recommend] recommendation failed:", error);
    return Response.json(
      { error: "AI 추천에 실패했어요. 잠시 후 다시 시도해 주세요." } satisfies AiErrorResponse,
      { status: STATUS_BAD_GATEWAY },
    );
  }
}
