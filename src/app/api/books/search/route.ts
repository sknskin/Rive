import { searchGoogleBooks } from "@/lib/bookSearch/googleBooks";
import { searchKakao } from "@/lib/bookSearch/kakao";
import type { BookSearchResponse } from "@/lib/types";

const STATUS_BAD_REQUEST = 400;
const STATUS_BAD_GATEWAY = 502;

// 도서 검색 — Kakao 우선, 실패 또는 키 부재 시 Google Books 폴백 (스펙 §59–60)
// Book search — Kakao first, falling back to Google Books when the key is absent or the call fails (spec §59–60)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";

  if (query === "") {
    return Response.json(
      { error: "검색어(q)가 필요합니다." },
      { status: STATUS_BAD_REQUEST },
    );
  }

  const kakaoKey = process.env.KAKAO_REST_API_KEY;

  if (kakaoKey) {
    try {
      const results = await searchKakao(query, kakaoKey);
      const body: BookSearchResponse = { results, source: "kakao" };
      return Response.json(body);
    } catch (error) {
      // Kakao 실패는 폴백으로 이어지므로 로그만 남긴다
      // A Kakao failure falls through to the fallback; log and continue
      console.error("[books/search] kakao failed, falling back to google:", error);
    }
  }

  try {
    const results = await searchGoogleBooks(query);
    const body: BookSearchResponse = { results, source: "google" };
    return Response.json(body);
  } catch (error) {
    console.error("[books/search] google books failed:", error);
    return Response.json(
      { error: "도서 검색에 실패했어요. 잠시 후 다시 시도해 주세요." },
      { status: STATUS_BAD_GATEWAY },
    );
  }
}
