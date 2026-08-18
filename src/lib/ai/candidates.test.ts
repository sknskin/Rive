import { describe, expect, it } from "vitest";
import { dedupeCandidates, normalizeTitle } from "./candidates";
import type { BookSearchResult } from "@/lib/types";

function makeResult(overrides: Partial<BookSearchResult>): BookSearchResult {
  return {
    title: "",
    authors: [],
    publisher: "",
    isbn13: "",
    coverUrl: "",
    pageCount: 0,
    kakaoUrl: "",
    googleBooksId: "",
    ...overrides,
  };
}

describe("normalizeTitle", () => {
  it("공백과 기호를 제거하고 소문자화한다", () => {
    expect(normalizeTitle("사피엔스: 유인원에서")).toBe(normalizeTitle("사피엔스 유인원에서"));
    expect(normalizeTitle("Cosmos")).toBe("cosmos");
  });
});

describe("dedupeCandidates", () => {
  it("isbn이 같으면 하나만 남긴다", () => {
    const a = makeResult({ title: "코스모스", isbn13: "9780001" });
    const b = makeResult({ title: "코스모스 (양장)", isbn13: "9780001" });
    expect(dedupeCandidates([[a], [b]], [])).toHaveLength(1);
  });

  it("isbn이 없어도 제목+저자가 같으면 하나만 남긴다", () => {
    const a = makeResult({ title: "코스모스", authors: ["칼 세이건"] });
    const b = makeResult({ title: "코스모스", authors: ["칼 세이건"] });
    expect(dedupeCandidates([[a, b]], [])).toHaveLength(1);
  });

  it("isbn이 달라도 제목이 같으면 판본 중복으로 보고 하나만 남긴다", () => {
    const a = makeResult({ title: "사피엔스", isbn13: "9780001" });
    const b = makeResult({ title: "사피엔스", isbn13: "9780002" });
    expect(dedupeCandidates([[a], [b]], [])).toHaveLength(1);
  });

  it("제외 목록의 제목은 기호가 달라도 걸러낸다", () => {
    const a = makeResult({ title: "사피엔스: 특별판", isbn13: "9780001" });
    const b = makeResult({ title: "코스모스", isbn13: "9780002" });
    const result = dedupeCandidates([[a, b]], ["사피엔스 특별판"]);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("코스모스");
  });

  it("빈 제목은 제외한다", () => {
    expect(dedupeCandidates([[makeResult({})]], [])).toHaveLength(0);
  });
});
