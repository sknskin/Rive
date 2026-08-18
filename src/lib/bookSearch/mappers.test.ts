import { describe, expect, it } from "vitest";
import { extractIsbn13, mapKakaoDocument } from "./kakao";
import { mapGoogleVolume } from "./googleBooks";

describe("extractIsbn13", () => {
  it("공백 구분 문자열에서 13자리 isbn을 추출한다", () => {
    expect(extractIsbn13("8934972467 9788934972464")).toBe("9788934972464");
  });

  it("13자리가 없으면 빈 문자열을 반환한다", () => {
    expect(extractIsbn13("8934972467")).toBe("");
    expect(extractIsbn13("")).toBe("");
  });
});

describe("mapKakaoDocument", () => {
  it("Kakao 문서를 BookSearchResult로 변환한다", () => {
    const result = mapKakaoDocument({
      title: "사피엔스",
      authors: ["유발 하라리"],
      publisher: "김영사",
      isbn: "8934972467 9788934972464",
      thumbnail: "https://example.com/cover.jpg",
      url: "https://search.daum.net/book",
      contents: "...",
    });

    expect(result.title).toBe("사피엔스");
    expect(result.isbn13).toBe("9788934972464");
    expect(result.coverUrl).toBe("https://example.com/cover.jpg");
    expect(result.kakaoUrl).toBe("https://search.daum.net/book");
    expect(result.googleBooksId).toBe("");
  });
});

describe("mapGoogleVolume", () => {
  it("Google 볼륨을 BookSearchResult로 변환하고 http 표지를 https로 치환한다", () => {
    const result = mapGoogleVolume({
      id: "abc123",
      volumeInfo: {
        title: "Sapiens",
        authors: ["Yuval Noah Harari"],
        publisher: "Harper",
        pageCount: 512,
        industryIdentifiers: [
          { type: "ISBN_10", identifier: "0062316095" },
          { type: "ISBN_13", identifier: "9780062316097" },
        ],
        imageLinks: { thumbnail: "http://books.google.com/cover.jpg" },
      },
    });

    expect(result.isbn13).toBe("9780062316097");
    expect(result.coverUrl).toBe("https://books.google.com/cover.jpg");
    expect(result.pageCount).toBe(512);
    expect(result.googleBooksId).toBe("abc123");
  });

  it("volumeInfo가 없어도 안전하게 변환한다", () => {
    const result = mapGoogleVolume({ id: "empty" });
    expect(result.title).toBe("");
    expect(result.authors).toEqual([]);
  });
});
