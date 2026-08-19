import type { AiErrorResponse } from "@/lib/ai/contracts";
import { generateJson, type GeminiSchema } from "@/lib/ai/gemini";
import { consumeDailyAiQuota, getUserFromRequest } from "@/lib/supabase/serverAuth";

const STATUS_BAD_REQUEST = 400;
const STATUS_UNAUTHORIZED = 401;
const STATUS_TOO_MANY_REQUESTS = 429;
const STATUS_SERVICE_UNAVAILABLE = 503;
const STATUS_BAD_GATEWAY = 502;
// 프롬프트에 들어가는 문자열 상한 — 임의 JSON 주입 방지 (6차 조사 B1)
// String cap for prompt inputs — blocks arbitrary JSON injection (audit 6 B1)
const MAX_LABEL_CHARS = 40;
const MAX_NAME_CHARS = 80;

const SUMMARY_SCHEMA: GeminiSchema = {
  type: "OBJECT",
  properties: {
    summary: {
      type: "STRING",
      description: "리캡을 마무리하는 따뜻한 한국어 1~2문장",
    },
  },
  required: ["summary"],
};

interface WrappedStatsPayload {
  label: string;
  totalSeconds: number;
  totalPages: number;
  readingDays: number;
  finishedBooks: number;
  topAuthor: string | null;
  topGenre: string | null;
}

// 리캡 자연어 요약 — 통계는 클라이언트가 계산하고 AI는 마무리 문장만 (스펙 §58)
// Wrapped natural-language summary — stats computed client-side; AI writes the closer (spec §58)
export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json(
      {
        error: "AI 요약을 사용하려면 GEMINI_API_KEY가 필요해요.",
        missingKey: true,
      } satisfies AiErrorResponse,
      { status: STATUS_SERVICE_UNAVAILABLE },
    );
  }

  // 로그인 사용자만 AI 호출 가능 (6차 조사 B1)
  // Signed-in users only (audit 6 B1)
  const authed = await getUserFromRequest(request);
  if (!authed) {
    return Response.json(
      { error: "AI 요약은 로그인 후 사용할 수 있어요. 설정에서 로그인해 주세요." } satisfies AiErrorResponse,
      { status: STATUS_UNAUTHORIZED },
    );
  }

  // 일일 사용량 상한 — 초과 시 429 (rate limit 1차)
  // Daily usage cap — 429 when exceeded (first-stage rate limit)
  if (!(await consumeDailyAiQuota(authed.token))) {
    return Response.json(
      { error: "오늘의 AI 사용량을 모두 썼어요. 내일 다시 이용해 주세요." } satisfies AiErrorResponse,
      { status: STATUS_TOO_MANY_REQUESTS },
    );
  }

  let stats: WrappedStatsPayload;
  try {
    const raw = (await request.json()) as Partial<WrappedStatsPayload>;
    // 알려진 필드만 화이트리스트로 복사한다 — 임의 키가 프롬프트에 들어가지 않게 (6차 B1)
    // Whitelist known fields so arbitrary keys never reach the prompt (audit 6 B1)
    stats = {
      label: String(raw.label ?? "").slice(0, MAX_LABEL_CHARS),
      totalSeconds: Number(raw.totalSeconds) || 0,
      totalPages: Number(raw.totalPages) || 0,
      readingDays: Number(raw.readingDays) || 0,
      finishedBooks: Number(raw.finishedBooks) || 0,
      topAuthor: raw.topAuthor ? String(raw.topAuthor).slice(0, MAX_NAME_CHARS) : null,
      topGenre: raw.topGenre ? String(raw.topGenre).slice(0, MAX_NAME_CHARS) : null,
    };
    if (stats.label === "") {
      throw new Error("label required");
    }
  } catch {
    return Response.json(
      { error: "잘못된 요청이에요." } satisfies AiErrorResponse,
      { status: STATUS_BAD_REQUEST },
    );
  }

  try {
    const prompt = [
      "아래는 한 독서가의 기간 리캡 통계다. 이 기록을 따뜻하고 담백하게 축하하는 한국어 문장 1~2개를 써라.",
      "규칙: 수치를 지어내지 않는다. 압박하거나 훈계하지 않는다. 과장된 이모지·느낌표를 남발하지 않는다.",
      "",
      JSON.stringify(stats, null, 2),
    ].join("\n");
    const result = await generateJson<{ summary: string }>(apiKey, prompt, SUMMARY_SCHEMA);
    return Response.json(result);
  } catch (error) {
    console.error("[ai/wrapped] summary failed:", error);
    return Response.json(
      { error: "요약을 만들지 못했어요. 잠시 후 다시 시도해 주세요." } satisfies AiErrorResponse,
      { status: STATUS_BAD_GATEWAY },
    );
  }
}
