import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

// 도서 검색 라우트 — fetch를 모킹해 폴백 체인을 검증한다
// Book-search route — fetch mocked to verify the fallback chain

const KAKAO_DOC = {
  title: "사피엔스",
  authors: ["유발 하라리"],
  publisher: "김영사",
  isbn: "8934972467 9788934972464",
  thumbnail: "https://example.com/k.jpg",
  url: "https://search.daum.net/book",
  contents: "소개",
};

const GOOGLE_VOLUME = {
  id: "gvol1",
  volumeInfo: {
    title: "Sapiens",
    authors: ["Yuval Noah Harari"],
    publisher: "Harper",
    pageCount: 512,
    industryIdentifiers: [{ type: "ISBN_13", identifier: "9780062316097" }],
    imageLinks: { thumbnail: "http://books.google.com/c.jpg" },
  },
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("GET /api/books/search", () => {
  it("q가 없으면 400을 반환한다", async () => {
    const response = await GET(new Request("http://test/api/books/search"));
    expect(response.status).toBe(400);
  });

  it("카카오 키가 있으면 카카오 결과를 우선 반환한다", async () => {
    vi.stubEnv("KAKAO_REST_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ documents: [KAKAO_DOC] })),
    );
    const response = await GET(new Request("http://test/api/books/search?q=사피엔스"));
    const body = await response.json();
    expect(body.source).toBe("kakao");
    expect(body.results[0].isbn13).toBe("9788934972464");
  });

  it("카카오 실패 시 구글 북스로 폴백한다", async () => {
    vi.stubEnv("KAKAO_REST_API_KEY", "test-key");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("dapi.kakao.com")) {
        return jsonResponse({}, false, 500);
      }
      return jsonResponse({ items: [GOOGLE_VOLUME] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const response = await GET(new Request("http://test/api/books/search?q=sapiens"));
    const body = await response.json();
    expect(body.source).toBe("google");
    expect(body.results[0].googleBooksId).toBe("gvol1");
  });

  it("두 소스 모두 실패하면 502를 반환한다", async () => {
    vi.stubEnv("KAKAO_REST_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({}, false, 500)),
    );
    const response = await GET(new Request("http://test/api/books/search?q=x"));
    expect(response.status).toBe(502);
  });
});
