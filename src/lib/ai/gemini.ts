// Gemini REST API 클라이언트 — 서버 전용, Structured JSON 응답 (스펙 §64, §68)
// Gemini REST client — server-only, structured JSON responses (spec §64, §68)

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_TEMPERATURE = 0.7;

// Gemini responseSchema는 대문자 Type enum을 사용하는 OpenAPI 서브셋이다
// Gemini's responseSchema is an OpenAPI subset using uppercase Type enums
export interface GeminiSchema {
  type: "OBJECT" | "ARRAY" | "STRING" | "NUMBER" | "INTEGER" | "BOOLEAN";
  description?: string;
  properties?: Record<string, GeminiSchema>;
  required?: string[];
  items?: GeminiSchema;
}

interface GeminiResponse {
  candidates?: {
    content?: {
      parts?: { text?: string }[];
    };
  }[];
}

// 텍스트 파트와 이미지(inlineData) 파트를 함께 보낼 수 있는 공통 요청부
// Shared request body builder supporting text and inline-image parts
type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

async function requestJson<T>(
  apiKey: string,
  parts: GeminiPart[],
  schema: GeminiSchema,
  temperature: number,
): Promise<T> {
  const url = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        temperature,
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`gemini request failed: ${response.status} ${body.slice(0, 300)}`);
  }

  const data = (await response.json()) as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("gemini returned an empty response");
  }

  try {
    return JSON.parse(text) as T;
  } catch (parseError) {
    console.error("[gemini] failed to parse JSON response:", parseError);
    throw new Error("gemini returned invalid JSON");
  }
}

export async function generateJson<T>(
  apiKey: string,
  prompt: string,
  schema: GeminiSchema,
): Promise<T> {
  return requestJson<T>(apiKey, [{ text: prompt }], schema, GEMINI_TEMPERATURE);
}

// 이미지 → 구조화 응답 — 인용구 사진 OCR에 사용, 추출 작업이라 온도를 낮게 둔다 (리서치)
// Image → structured output for quote-photo OCR; low temperature for extraction
const GEMINI_OCR_TEMPERATURE = 0.1;

export async function generateJsonFromImage<T>(
  apiKey: string,
  prompt: string,
  schema: GeminiSchema,
  imageBase64: string,
  mimeType: string,
): Promise<T> {
  return requestJson<T>(
    apiKey,
    [{ inlineData: { mimeType, data: imageBase64 } }, { text: prompt }],
    schema,
    GEMINI_OCR_TEMPERATURE,
  );
}
