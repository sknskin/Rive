import type { AiErrorResponse, ProfileRequest, ProfileResponse } from "@/lib/ai/contracts";
import { generateJson } from "@/lib/ai/gemini";
import { buildProfilePrompt, PROFILE_SCHEMA } from "@/lib/ai/prompts";

const STATUS_BAD_REQUEST = 400;
const STATUS_SERVICE_UNAVAILABLE = 503;
const STATUS_BAD_GATEWAY = 502;

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

  let payload: ProfileRequest;
  try {
    payload = (await request.json()) as ProfileRequest;
  } catch {
    return Response.json(
      { error: "잘못된 요청이에요." } satisfies AiErrorResponse,
      { status: STATUS_BAD_REQUEST },
    );
  }

  if (!payload.preference || !payload.behavior) {
    return Response.json(
      { error: "분석에 필요한 데이터가 없어요." } satisfies AiErrorResponse,
      { status: STATUS_BAD_REQUEST },
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
