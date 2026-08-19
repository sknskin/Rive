import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

// 메타 보강 라우트 — 구글 실패 시 오픈라이브러리 폴백을 검증한다
// Enrichment route — verifies the Open Library fallback when Google fails

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

describe("GET /api/books/enrich", () => {
  it("isbn과 title이 모두 없으면 400을 반환한다", async () => {
    const response = await GET(new Request("http://test/api/books/enrich"));
    expect(response.status).toBe(400);
  });

  it("201자 파라미터는 400을 반환하고 외부 API를 호출하지 않는다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await GET(
      new Request(`http://test/api/books/enrich?title=${"a".repeat(201)}`),
    );
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("구글이 응답하면 구글 메타를 반환한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          items: [
            {
              id: "g1",
              volumeInfo: { pageCount: 320, description: "설명", categories: ["History"] },
            },
          ],
        }),
      ),
    );
    const response = await GET(
      new Request("http://test/api/books/enrich?isbn=9788934972464"),
    );
    const body = await response.json();
    expect(body).toEqual({ pageCount: 320, description: "설명", categories: ["History"] });
    expect(response.headers.get("cache-control")).toContain("s-maxage=86400");
  });

  it("구글이 429로 실패하면 오픈라이브러리 폴백을 사용한다", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("googleapis.com")) {
        return jsonResponse({}, false, 429);
      }
      return jsonResponse({
        "ISBN:9788934972464": {
          number_of_pages: 636,
          subjects: [{ name: "History" }],
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const response = await GET(
      new Request("http://test/api/books/enrich?isbn=9788934972464"),
    );
    const body = await response.json();
    expect(body.pageCount).toBe(636);
    expect(body.categories).toEqual(["History"]);
  });

  it("두 소스 모두 결과가 없으면 빈 메타를 반환한다 (재시도 폭주 방지)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("googleapis.com")) {
          return jsonResponse({ items: [] });
        }
        return jsonResponse({});
      }),
    );
    const response = await GET(
      new Request("http://test/api/books/enrich?isbn=0000&title=없는책"),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual({ pageCount: 0, description: "", categories: [] });
  });
});
