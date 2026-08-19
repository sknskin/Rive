import type { AiErrorResponse } from "@/lib/ai/contracts";
import { generateJsonFromImage, type GeminiSchema } from "@/lib/ai/gemini";
import { consumeDailyAiQuota, getUserFromRequest } from "@/lib/supabase/serverAuth";

const STATUS_BAD_REQUEST = 400;
const STATUS_UNAUTHORIZED = 401;
const STATUS_TOO_MANY_REQUESTS = 429;
const STATUS_SERVICE_UNAVAILABLE = 503;
const STATUS_BAD_GATEWAY = 502;

// 이미지 base64 상한 — 클라이언트가 1024px/JPEG로 압축해 보내므로 넉넉한 방어선 (비용 어뷰징 방지)
// Base64 image cap — the client sends compressed 1024px JPEG, this is a generous guard
const MAX_IMAGE_BASE64_CHARS = 2_000_000;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const OCR_SCHEMA: GeminiSchema = {
  type: "OBJECT",
  properties: {
    text: {
      type: "STRING",
      description: "사진 속 본문 문장을 원문 그대로 추출한 텍스트. 글자가 없으면 빈 문자열.",
    },
  },
  required: ["text"],
};

interface QuoteOcrPayload {
  imageBase64: string;
  mimeType: string;
}

// 인용구 사진 OCR — 책 페이지 사진에서 문장을 추출한다 (리서치 기능 2차)
// Quote-photo OCR — extracts sentences from a photographed book page
export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "사진 인식을 사용하려면 GEMINI_API_KEY가 필요해요.", missingKey: true } satisfies AiErrorResponse,
      { status: STATUS_SERVICE_UNAVAILABLE },
    );
  }

  const authed = await getUserFromRequest(request);
  if (!authed) {
    return Response.json(
      { error: "사진에서 가져오기는 로그인 후 사용할 수 있어요. 설정에서 로그인해 주세요." } satisfies AiErrorResponse,
      { status: STATUS_UNAUTHORIZED },
    );
  }

  if (!(await consumeDailyAiQuota(authed.token))) {
    return Response.json(
      { error: "오늘의 AI 사용량을 모두 썼어요. 내일 다시 이용해 주세요." } satisfies AiErrorResponse,
      { status: STATUS_TOO_MANY_REQUESTS },
    );
  }

  let payload: QuoteOcrPayload;
  try {
    payload = (await request.json()) as QuoteOcrPayload;
  } catch {
    return Response.json(
      { error: "잘못된 요청이에요." } satisfies AiErrorResponse,
      { status: STATUS_BAD_REQUEST },
    );
  }

  if (
    typeof payload.imageBase64 !== "string" ||
    payload.imageBase64.length === 0 ||
    payload.imageBase64.length > MAX_IMAGE_BASE64_CHARS ||
    !ALLOWED_MIME_TYPES.has(payload.mimeType)
  ) {
    return Response.json(
      { error: "이미지를 처리할 수 없어요. 다른 사진으로 시도해 주세요." } satisfies AiErrorResponse,
      { status: STATUS_BAD_REQUEST },
    );
  }

  try {
    const prompt = [
      "이 사진은 책 페이지다. 사진 속 본문 텍스트를 원문 그대로 추출하라.",
      "규칙: 오탈자를 고치지 않는다. 문장을 요약하거나 창작하지 않는다.",
      "페이지 번호·머리글·꼬리말은 제외한다. 글자를 읽을 수 없으면 text를 빈 문자열로 둔다.",
    ].join("\n");
    const result = await generateJsonFromImage<{ text: string }>(
      apiKey,
      prompt,
      OCR_SCHEMA,
      payload.imageBase64,
      payload.mimeType,
    );
    return Response.json({ text: result.text.trim() });
  } catch (error) {
    console.error("[ai/quote-ocr] extraction failed:", error);
    return Response.json(
      { error: "사진에서 글자를 읽지 못했어요. 잠시 후 다시 시도해 주세요." } satisfies AiErrorResponse,
      { status: STATUS_BAD_GATEWAY },
    );
  }
}
