import type { GoogleBooksResponse } from "./types";
import { fetchExternal } from "./fetchExternal";

const GOOGLE_BOOKS_API_URL = "https://www.googleapis.com/books/v1/volumes";
const SINGLE_RESULT = 1;

export interface BookMeta {
  pageCount: number;
  description: string;
  categories: string[];
}

async function queryGoogle(query: string): Promise<BookMeta | null> {
  const url = new URL(GOOGLE_BOOKS_API_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", String(SINGLE_RESULT));

  // 키가 있으면 프로젝트 쿼터를 사용해 키리스 IP 제한(429)을 피한다
  // With a key, project quota applies and avoids keyless IP throttling (429)
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  if (apiKey) {
    url.searchParams.set("key", apiKey);
  }

  const response = await fetchExternal(url);
  if (!response.ok) {
    throw new Error(`google meta lookup failed: ${response.status}`);
  }

  const data = (await response.json()) as GoogleBooksResponse;
  const info = data.items?.[0]?.volumeInfo;
  if (!info) {
    return null;
  }

  return {
    pageCount: info.pageCount ?? 0,
    description: info.description ?? "",
    categories: info.categories ?? [],
  };
}

// ISBN 우선 조회, 없거나 결과가 비면 제목+저자로 폴백 (스펙 §60–61 메타 병합)
// Look up by ISBN first, falling back to title + author (spec §60–61 metadata merge)
export async function fetchGoogleMeta(
  isbn13: string,
  title: string,
  author: string,
): Promise<BookMeta | null> {
  if (isbn13 !== "") {
    const byIsbn = await queryGoogle(`isbn:${isbn13}`);
    if (byIsbn) {
      return byIsbn;
    }
  }
  if (title !== "") {
    const titleQuery =
      author !== "" ? `intitle:${title} inauthor:${author}` : `intitle:${title}`;
    return queryGoogle(titleQuery);
  }
  return null;
}
