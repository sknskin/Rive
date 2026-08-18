"use client";

import { useEffect, useRef, useState } from "react";
import BookCover from "@/components/BookCover";
import { SEARCH_DEBOUNCE_MS } from "@/lib/constants";
import type { BookSearchResponse, BookSearchResult } from "@/lib/types";

interface BookSearchProps {
  onSelect: (result: BookSearchResult) => void;
}

// 시트 내 도서 검색 — 즉각적인 반응을 위해 debounce 적용 (스펙 §6)
// In-sheet book search — debounced for instant-feeling feedback (spec §6)
export default function BookSearch({ onSelect }: BookSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BookSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestSeq = useRef(0);

  // 빈 검색어 리셋은 입력 핸들러에서 처리해 effect 내 동기 setState를 피한다
  // Reset-on-empty happens in the input handler to avoid sync setState in effects
  function handleQueryChange(value: string) {
    setQuery(value);
    if (value.trim() === "") {
      setResults([]);
      setError("");
      setLoading(false);
    } else {
      setLoading(true);
    }
  }

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === "") {
      return;
    }

    const seq = ++requestSeq.current;

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/books/search?q=${encodeURIComponent(trimmed)}`);
        if (!response.ok) {
          throw new Error(`search failed: ${response.status}`);
        }
        const data = (await response.json()) as BookSearchResponse;
        // 이전 요청의 늦은 응답이 최신 결과를 덮어쓰지 않도록 한다
        // Prevent a stale response from overwriting newer results
        if (seq === requestSeq.current) {
          setResults(data.results);
          setError("");
        }
      } catch (searchError) {
        console.error("[BookSearch] search failed:", searchError);
        if (seq === requestSeq.current) {
          setResults([]);
          setError("검색에 실패했어요. 잠시 후 다시 시도해 주세요.");
        }
      } finally {
        if (seq === requestSeq.current) {
          setLoading(false);
        }
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="px-2">
      <input
        type="search"
        autoFocus
        value={query}
        onChange={(event) => handleQueryChange(event.target.value)}
        placeholder="책 제목이나 저자를 검색"
        className="w-full rounded-xl bg-fill px-4 py-3 text-[15px] outline-none placeholder:text-ink-tertiary focus:ring-2 focus:ring-tint"
      />

      <div className="mt-3 min-h-48">
        {error !== "" && (
          <p className="px-2 py-8 text-center text-sm text-ink-secondary">{error}</p>
        )}

        {error === "" && !loading && query.trim() !== "" && results.length === 0 && (
          <p className="px-2 py-8 text-center text-sm text-ink-secondary">
            검색 결과가 없어요.
          </p>
        )}

        <ul className="divide-y divide-separator">
          {results.map((result, index) => (
            <li key={`${result.isbn13}-${index}`}>
              <button
                type="button"
                onClick={() => onSelect(result)}
                className="flex w-full items-center gap-3.5 py-3 text-left active:opacity-60"
              >
                <BookCover title={result.title} coverUrl={result.coverUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium">{result.title}</p>
                  <p className="truncate text-sm text-ink-secondary">
                    {result.authors.join(", ")}
                    {result.publisher && ` · ${result.publisher}`}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-medium text-tint">읽기 시작</span>
              </button>
            </li>
          ))}
        </ul>

        {loading && results.length === 0 && (
          <p className="px-2 py-8 text-center text-sm text-ink-tertiary">검색 중…</p>
        )}
      </div>
    </div>
  );
}
