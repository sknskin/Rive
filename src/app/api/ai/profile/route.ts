import type { AiErrorResponse, ProfileRequest, ProfileResponse } from "@/lib/ai/contracts";
import { generateJson } from "@/lib/ai/gemini";
import { buildProfilePrompt, PROFILE_SCHEMA } from "@/lib/ai/prompts";
import { consumeDailyAiQuota, getUserFromRequest } from "@/lib/supabase/serverAuth";
import {
  isBehaviorSnapshot,
  isPreferencePayload,
  isRecord,
  readJsonBody,
} from "../requestValidation";

const STATUS_BAD_REQUEST = 400;
const STATUS_UNAUTHORIZED = 401;
const STATUS_TOO_MANY_REQUESTS = 429;
const STATUS_SERVICE_UNAVAILABLE = 503;
const STATUS_BAD_GATEWAY = 502;
// 비용 어뷰징 방지용 요청 본문 상한 (6차 조사 B1)
// Request-body cap against cost abuse (audit 6 B1)
const MAX_BODY_CHARS = 200_000;

// AI 취향 분석 — 분석 요청 1회당 Gemini 1회 호출, 결과는 클라이언트가 캐시 (스펙 §65)
// AI taste analysis — one Gemini call per request; the client caches the result (spec §65)
export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const body: AiErrorResponse = {
      error: "AI 분석을 사용하려면 .env.local에 GEMINI_API_KEY를 추가해 주세요.",
      missingKey: true,
    };
    return Response.json(body, { status: STATUS_SERVICE_UNAVAILABLE });
  }

  // 로그인 사용자만 AI 호출 가능 — Gemini 비용 어뷰징 차단 (6차 조사 B1)
  // Only signed-in users may call the AI — blocks Gemini cost abuse (audit 6 B1)
  const authed = await getUserFromRequest(request);
  if (!authed) {
    return Response.json(
      { error: "AI 분석은 로그인 후 사용할 수 있어요. 설정에서 로그인해 주세요." } satisfies AiErrorResponse,
      { status: STATUS_UNAUTHORIZED },
    );
  }

  let payload: ProfileRequest;
  try {
    const raw = await readJsonBody(request, MAX_BODY_CHARS);
    if (
      !isRecord(raw) ||
      !isPreferencePayload(raw.preference) ||
      !isBehaviorSnapshot(raw.behavior)
    ) {
      throw new Error("invalid profile payload");
    }
    payload = raw as unknown as ProfileRequest;
  } catch {
    return Response.json(
      { error: "잘못된 요청이에요." } satisfies AiErrorResponse,
      { status: STATUS_BAD_REQUEST },
    );
  }

  if (!(await consumeDailyAiQuota(authed.token))) {
    return Response.json(
      { error: "오늘의 AI 사용량을 모두 썼어요. 내일 다시 이용해 주세요." } satisfies AiErrorResponse,
      { status: STATUS_TOO_MANY_REQUESTS },
    );
  }

  try {
    const profile = await generateJson<ProfileResponse>(
      apiKey,
      buildProfilePrompt(payload),
      PROFILE_SCHEMA,
    );
    return Response.json(profile);
  } catch (error) {
    console.error("[ai/profile] analysis failed:", error);
    return Response.json(
      { error: "AI 분석에 실패했어요. 잠시 후 다시 시도해 주세요." } satisfies AiErrorResponse,
      { status: STATUS_BAD_GATEWAY },
    );
  }
}
