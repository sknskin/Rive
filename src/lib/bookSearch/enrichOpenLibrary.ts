import type { BookMeta } from "./enrichGoogle";
import { fetchExternal } from "./fetchExternal";

// Open Library 메타 보강 — 키가 필요 없는 3순위 소스 (스펙 §60–61)
// Open Library enrichment — keyless third-priority source (spec §60–61)

const OPEN_LIBRARY_API_URL = "https://openlibrary.org/api/books";
const MAX_SUBJECTS = 5;

interface OpenLibrarySubject {
  name?: string;
}

interface OpenLibraryRecord {
  number_of_pages?: number;
  subjects?: OpenLibrarySubject[];
}

type OpenLibraryResponse = Record<string, OpenLibraryRecord | undefined>;

// 응답 파싱 — 페이지 수와 주제(장르)만 사용, 설명은 이 엔드포인트에 없음
// Response parsing — pages and subjects only; descriptions aren't in this endpoint
export function parseOpenLibraryData(
  data: OpenLibraryResponse,
  isbn13: string,
): BookMeta | null {
  const record = data[`ISBN:${isbn13}`];
  if (!record) {
    return null;
  }
  const categories = (record.subjects ?? [])
    .map((subject) => subject.name ?? "")
    .filter((name) => name !== "")
    .slice(0, MAX_SUBJECTS);

  const pageCount = record.number_of_pages ?? 0;
  if (pageCount === 0 && categories.length === 0) {
    return null;
  }
  return { pageCount, description: "", categories };
}

export async function fetchOpenLibraryMeta(isbn13: string): Promise<BookMeta | null> {
  if (isbn13 === "") {
    return null;
  }
  const url = new URL(OPEN_LIBRARY_API_URL);
  url.searchParams.set("bibkeys", `ISBN:${isbn13}`);
  url.searchParams.set("format", "json");
  url.searchParams.set("jscmd", "data");

  const response = await fetchExternal(url);
  if (!response.ok) {
    throw new Error(`open library lookup failed: ${response.status}`);
  }
  const data = (await response.json()) as OpenLibraryResponse;
  return parseOpenLibraryData(data, isbn13);
}
