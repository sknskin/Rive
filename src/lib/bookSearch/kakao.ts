import type { BookSearchResult } from "@/lib/types";
import { SEARCH_RESULT_SIZE } from "@/lib/constants";
import type { KakaoBookDocument, KakaoBookResponse } from "./types";

const KAKAO_BOOK_API_URL = "https://dapi.kakao.com/v3/search/book";
const ISBN13_LENGTH = 13;

// Kakao의 isbn 필드는 "isbn10 isbn13" 공백 구분 문자열이다
// Kakao's isbn field is a space-separated "isbn10 isbn13" string
export function extractIsbn13(rawIsbn: string): string {
  const found = rawIsbn
    .split(" ")
    .map((part) => part.trim())
    .find((part) => part.length === ISBN13_LENGTH);
  return found ?? "";
}

export function mapKakaoDocument(doc: KakaoBookDocument): BookSearchResult {
  return {
    title: doc.title,
    authors: doc.authors,
    publisher: doc.publisher,
    isbn13: extractIsbn13(doc.isbn),
    coverUrl: doc.thumbnail ?? "",
    pageCount: 0,
    kakaoUrl: doc.url ?? "",
    googleBooksId: "",
  };
}

export async function searchKakao(query: string, apiKey: string): Promise<BookSearchResult[]> {
  const url = new URL(KAKAO_BOOK_API_URL);
  url.searchParams.set("query", query);
  url.searchParams.set("size", String(SEARCH_RESULT_SIZE));

  const response = await fetch(url, {
    headers: { Authorization: `KakaoAK ${apiKey}` },
  });

  if (!response.ok) {
    throw new Error(`kakao book search failed: ${response.status}`);
  }

  const data = (await response.json()) as KakaoBookResponse;
  return data.documents.map(mapKakaoDocument);
}
