import type { BookSearchResult } from "@/lib/types";
import { SEARCH_RESULT_SIZE } from "@/lib/constants";
import type { GoogleBooksResponse, GoogleVolume } from "./types";

const GOOGLE_BOOKS_API_URL = "https://www.googleapis.com/books/v1/volumes";
const ISBN13_TYPE = "ISBN_13";

export function mapGoogleVolume(volume: GoogleVolume): BookSearchResult {
  const info = volume.volumeInfo ?? {};
  const isbn13 =
    info.industryIdentifiers?.find((identifier) => identifier.type === ISBN13_TYPE)
      ?.identifier ?? "";

  // Google 썸네일은 http로 내려오는 경우가 있어 https로 치환한다
  // Google thumbnails may be served over http; upgrade to https
  const rawThumbnail = info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail ?? "";
  const coverUrl = rawThumbnail.replace(/^http:\/\//, "https://");

  return {
    title: info.title ?? "",
    authors: info.authors ?? [],
    publisher: info.publisher ?? "",
    isbn13,
    coverUrl,
    pageCount: info.pageCount ?? 0,
    kakaoUrl: "",
    googleBooksId: volume.id,
  };
}

export async function searchGoogleBooks(query: string): Promise<BookSearchResult[]> {
  const url = new URL(GOOGLE_BOOKS_API_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", String(SEARCH_RESULT_SIZE));

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`google books search failed: ${response.status}`);
  }

  const data = (await response.json()) as GoogleBooksResponse;
  return (data.items ?? [])
    .map(mapGoogleVolume)
    .filter((result) => result.title !== "");
}
