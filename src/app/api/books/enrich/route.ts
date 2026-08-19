import { fetchGoogleMeta, type BookMeta } from "@/lib/bookSearch/enrichGoogle";
import { fetchOpenLibraryMeta } from "@/lib/bookSearch/enrichOpenLibrary";

const STATUS_BAD_REQUEST = 400;
const STATUS_BAD_GATEWAY = 502;
// 외부 API 프록시 남용 방지용 입력 길이 상한 (7차 조사 권장)
// Input-length cap against proxy abuse (audit 7 recommendation)
const MAX_PARAM_CHARS = 200;
const PUBLIC_CACHE_CONTROL = "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800";

// 도서 메타 보강 — Google Books 우선, 실패/결과 없음이면 Open Library 폴백 (스펙 §60–61)
// Book metadata enrichment — Google Books first, Open Library fallback (spec §60–61)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const isbn = searchParams.get("isbn")?.trim() ?? "";
  const title = searchParams.get("title")?.trim() ?? "";
  const author = searchParams.get("author")?.trim() ?? "";

  if (
    (isbn === "" && title === "") ||
    isbn.length > MAX_PARAM_CHARS ||
    title.length > MAX_PARAM_CHARS ||
    author.length > MAX_PARAM_CHARS
  ) {
    return Response.json(
      { error: "isbn 또는 title이 필요합니다." },
      { status: STATUS_BAD_REQUEST },
    );
  }

  let meta: BookMeta | null = null;

  try {
    meta = await fetchGoogleMeta(isbn, title, author);
  } catch (error) {
    // Google 실패(키 제한/쿼터)는 Open Library 폴백으로 이어진다
    // Google failures (key restriction/quota) fall through to Open Library
    console.error("[books/enrich] google lookup failed, trying open library:", error);
  }

  if (!meta) {
    try {
      meta = await fetchOpenLibraryMeta(isbn);
    } catch (error) {
      console.error("[books/enrich] open library lookup failed:", error);
      return Response.json(
        { error: "도서 정보를 보강하지 못했어요." },
        { status: STATUS_BAD_GATEWAY },
      );
    }
  }

  // 결과가 없어도 정상 응답 — 클라이언트는 시도 자체를 기록해 재시도 폭주를 막는다
  // No match is still a success — the client records the attempt to avoid retry storms
  return Response.json(meta ?? { pageCount: 0, description: "", categories: [] }, {
    headers: { "Cache-Control": PUBLIC_CACHE_CONTROL },
  });
}
