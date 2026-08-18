import type { BookSearchResult } from "@/lib/types";

// 추천 후보 정리 — 중복 제거와 제외 목록 필터링 (순수 함수)
// Candidate cleanup — dedupe and exclusion filtering (pure functions)

// 제목 비교용 정규화: 공백/기호 제거 + 소문자화
// Title normalization for comparison: strip spaces/symbols, lowercase
export function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

export function dedupeCandidates(
  lists: BookSearchResult[][],
  excludeTitles: string[],
): BookSearchResult[] {
  const excluded = new Set(excludeTitles.map(normalizeTitle));
  const seenKeys = new Set<string>();
  const result: BookSearchResult[] = [];

  for (const list of lists) {
    for (const candidate of list) {
      if (candidate.title === "") {
        continue;
      }
      const normalizedTitle = normalizeTitle(candidate.title);
      if (excluded.has(normalizedTitle)) {
        continue;
      }
      // isbn이 있으면 isbn 기준, 없으면 제목+저자 기준으로 중복 제거한다
      // Dedupe by isbn when present, otherwise by title + authors
      const key =
        candidate.isbn13 !== ""
          ? `isbn:${candidate.isbn13}`
          : `t:${normalizedTitle}|${candidate.authors.join(",")}`;
      if (seenKeys.has(key) || seenKeys.has(`t:${normalizedTitle}`)) {
        continue;
      }
      seenKeys.add(key);
      seenKeys.add(`t:${normalizedTitle}`);
      result.push(candidate);
    }
  }

  return result;
}
