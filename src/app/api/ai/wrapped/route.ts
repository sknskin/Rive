import type { AiErrorResponse } from "@/lib/ai/contracts";
import { generateJson, type GeminiSchema } from "@/lib/ai/gemini";

const STATUS_BAD_REQUEST = 400;
const STATUS_SERVICE_UNAVAILABLE = 503;
const STATUS_BAD_GATEWAY = 502;

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

  let stats: WrappedStatsPayload;
  try {
    stats = (await request.json()) as WrappedStatsPayload;
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
