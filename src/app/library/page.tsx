"use client";

import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import PageSkeleton from "@/components/PageSkeleton";
import { useSearchParams } from "next/navigation";
import BookCover from "@/components/BookCover";
import BottomSheet from "@/components/BottomSheet";
import { STATUS_LABELS, STATUS_ORDER } from "@/lib/constants";
import { subscribeLibraryChange } from "@/lib/libraryEvents";
import { getRepository } from "@/lib/repository";
import type { Book, BookStatus, UserBook } from "@/lib/types";

interface LibraryItem {
  book: Book;
  userBook: UserBook;
}

// Library — 표지 중심 그리드 + 상태 필터 (스펙 §21, Apple Books 철학)
// Library — cover-centric grid with status filter (spec §21)
// useSearchParams 사용 페이지는 Suspense 경계가 필요하다 (Next 규칙)
// Pages using useSearchParams need a Suspense boundary (Next requirement)
export default function LibraryPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <LibraryContent />
    </Suspense>
  );
}

function isBookStatus(value: string | null): value is BookStatus {
  return value !== null && (STATUS_ORDER as string[]).includes(value);
}

// 그리드/리스트 뷰 선택 — localStorage에 저장, SSR은 grid 기본 (스펙 §21)
// Grid/list view choice — persisted in localStorage, grid default on SSR (spec §21)
const LIBRARY_VIEW_KEY = "rive-library-view";
const LIBRARY_VIEW_EVENT = "rive-library-view-change";
type LibraryView = "grid" | "list";

function subscribeLibraryView(callback: () => void): () => void {
  window.addEventListener(LIBRARY_VIEW_EVENT, callback);
  return () => window.removeEventListener(LIBRARY_VIEW_EVENT, callback);
}

function getStoredLibraryView(): LibraryView {
  try {
    return localStorage.getItem(LIBRARY_VIEW_KEY) === "list" ? "list" : "grid";
  } catch (error) {
    console.error("[Library] failed to read view preference:", error);
    return "grid";
  }
}

function setStoredLibraryView(view: LibraryView): void {
  try {
    localStorage.setItem(LIBRARY_VIEW_KEY, view);
    window.dispatchEvent(new Event(LIBRARY_VIEW_EVENT));
  } catch (error) {
    console.error("[Library] failed to save view preference:", error);
  }
}

// 최소 별점 필터 선택지 — 0은 전체 (스펙 §21 장르·저자·평점 필터)
// Minimum-rating filter options — 0 means all (spec §21)
const MIN_RATING_OPTIONS = [0, 3, 4, 5] as const;

function LibraryContent() {
  const searchParams = useSearchParams();
  // ?status=want 등으로 진입하면 해당 탭을 초기 선택한다 (추천 → 서재 이동 경로)
  // Entering with ?status=want preselects that tab (recommendation → shelf path)
  const statusParam = searchParams.get("status");
  const [status, setStatus] = useState<BookStatus>(
    isBookStatus(statusParam) ? statusParam : "reading",
  );
  const view = useSyncExternalStore(subscribeLibraryView, getStoredLibraryView, () => "grid");
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  // 장르·저자·평점 필터 (스펙 §21) — 즉시 적용형, 탭 전환 시 초기화
  // Genre/author/rating filters (spec §21) — applied live, reset on tab change
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedAuthors, setSelectedAuthors] = useState<string[]>([]);
  const [minRating, setMinRating] = useState(0);

  function clearFilters() {
    setSelectedGenres([]);
    setSelectedAuthors([]);
    setMinRating(0);
  }

  function handleStatusChange(next: BookStatus) {
    setStatus(next);
    // 탭마다 장르/저자 구성이 달라 이전 선택이 무의미해진다
    // Each tab has different genres/authors, so stale picks are cleared
    clearFilters();
  }

  // 전역 + 버튼으로 책이 추가되면 이동 없이 목록을 갱신한다
  // Refresh in place when a book is added via the global + button
  useEffect(() => {
    return subscribeLibraryChange(() => setReloadKey((key) => key + 1));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const repository = getRepository();
      try {
        const userBooks = await repository.listUserBooksByStatus(status);
        // 책마다 개별 조회하지 않고 배치로 가져온다 — N+1 방지 (6차 조사 D3)
        // Batch-load books instead of per-book lookups — avoids N+1 (audit 6 D3)
        const booksById = await repository.listBooksByIds(
          userBooks.map((userBook) => userBook.bookId),
        );
        const loaded: LibraryItem[] = [];
        for (const userBook of userBooks) {
          const book = booksById.get(userBook.bookId);
          if (book) {
            loaded.push({ book, userBook });
          }
        }
        if (!cancelled) {
          setItems(loaded);
          setLoadError("");
          setReady(true);
        }
      } catch (error) {
        console.error("[Library] failed to load:", error);
        if (!cancelled) {
          setLoadError("서재를 불러오지 못했어요.");
          setReady(true);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [status, reloadKey]);

  // 필터 선택지는 현재 탭의 책들에서 수집한다
  // Filter options are gathered from the current tab's books
  const genreOptions = [...new Set(items.flatMap(({ book }) => book.categories ?? []))].sort();
  const authorOptions = [...new Set(items.flatMap(({ book }) => book.authors))].sort();
  const activeFilterCount =
    selectedGenres.length + selectedAuthors.length + (minRating > 0 ? 1 : 0);

  const filteredItems = items.filter(({ book, userBook }) => {
    if (
      selectedGenres.length > 0 &&
      !(book.categories ?? []).some((category) => selectedGenres.includes(category))
    ) {
      return false;
    }
    if (
      selectedAuthors.length > 0 &&
      !book.authors.some((author) => selectedAuthors.includes(author))
    ) {
      return false;
    }
    if (minRating > 0 && (userBook.rating ?? 0) < minRating) {
      return false;
    }
    return true;
  });

  function toggleValue(list: string[], setList: (next: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  }

  const filterChipClass = (selected: boolean) =>
    `cursor-pointer rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors duration-150 ${
      selected ? "bg-accent text-accent-ink" : "bg-fill text-ink-secondary"
    }`;

  return (
    <main className="flex-1 px-5 pt-8 pb-20">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Library</h1>
        <button
          type="button"
          aria-label={view === "grid" ? "리스트로 보기" : "그리드로 보기"}
          onClick={() => setStoredLibraryView(view === "grid" ? "list" : "grid")}
          className="flex size-9 cursor-pointer items-center justify-center rounded-full text-ink-tertiary transition-colors duration-150 hover:bg-fill hover:text-ink active:bg-fill"
        >
          {view === "grid" ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <path d="M4 6.5h16M4 12h16M4 17.5h16" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <rect x="4" y="4" width="7" height="7" rx="1.5" />
              <rect x="13" y="4" width="7" height="7" rx="1.5" />
              <rect x="4" y="13" width="7" height="7" rx="1.5" />
              <rect x="13" y="13" width="7" height="7" rx="1.5" />
            </svg>
          )}
        </button>
      </div>

      <div className="scrollbar-none -mx-5 mt-4 flex gap-2 overflow-x-auto px-5">
        {STATUS_ORDER.map((candidate) => {
          const active = candidate === status;
          return (
            <button
              key={candidate}
              type="button"
              aria-pressed={active}
              onClick={() => handleStatusChange(candidate)}
              className={`shrink-0 cursor-pointer rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-150 ${
                active ? "bg-accent text-accent-ink" : "bg-fill text-ink-secondary"
              }`}
            >
              {STATUS_LABELS[candidate]}
            </button>
          );
        })}
        {/* 장르·저자·평점 필터 진입점 — 걸린 필터 수를 함께 표시 (스펙 §21) */}
        {/* Filter entry showing the active-filter count (spec §21) */}
        {(genreOptions.length > 0 || authorOptions.length > 0 || items.length > 0) && (
          <button
            type="button"
            aria-pressed={activeFilterCount > 0}
            onClick={() => setFilterSheetOpen(true)}
            className={`shrink-0 cursor-pointer rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-150 ${
              activeFilterCount > 0
                ? "bg-tint text-white"
                : "bg-fill text-ink-secondary"
            }`}
          >
            필터{activeFilterCount > 0 ? ` ${activeFilterCount}` : ""}
          </button>
        )}
      </div>

      {loadError !== "" && <p className="mt-8 text-sm text-danger">{loadError}</p>}

      {ready && loadError === "" && items.length === 0 && (
        <div className="mt-24 text-center">
          <p className="text-[17px] font-semibold tracking-tight">
            {status === "reading"
              ? "아직 서재가 텅 비어 있어요"
              : `'${STATUS_LABELS[status]}' 책장은 아직 비어 있어요`}
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-secondary">
            {status === "reading" ? (
              <>
                위의 <span className="font-semibold text-ink">+</span> 버튼이나{" "}
                <span className="font-semibold text-ink">READ</span>를 누르면
                <br />
                첫 책을 바로 담을 수 있어요
              </>
            ) : (
              <>
                위의 <span className="font-semibold text-ink">+</span> 버튼으로
                <br />
                언제든 채워나갈 수 있어요
              </>
            )}
          </p>
        </div>
      )}

      {/* 필터 결과가 비었을 때는 서재 빈 상태와 구분되는 안내를 준다 */}
      {/* Distinct message when filters match nothing (vs an empty shelf) */}
      {ready && loadError === "" && items.length > 0 && filteredItems.length === 0 && (
        <div className="mt-24 text-center">
          <p className="text-[17px] font-semibold tracking-tight">조건에 맞는 책이 없어요</p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-3 cursor-pointer text-sm font-medium text-tint active:opacity-70"
          >
            필터 초기화
          </button>
        </div>
      )}

      {view === "grid" ? (
        <div className="mt-6 grid grid-cols-3 gap-x-4 gap-y-6 md:grid-cols-4 lg:grid-cols-6">
          {filteredItems.map(({ book }) => (
            <Link key={book.id} href={`/library/${book.id}`} className="group">
              <div className="transition-transform duration-150 group-active:scale-95">
                <BookCover title={book.title} coverUrl={book.coverUrl} size="fluid" />
              </div>
              <p className="mt-2 line-clamp-2 text-xs leading-snug font-medium break-keep">
                {book.title}
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-separator">
          {filteredItems.map(({ book, userBook }) => (
            <li key={book.id}>
              <Link
                href={`/library/${book.id}`}
                className="flex cursor-pointer items-center gap-3.5 py-3 active:opacity-70"
              >
                <BookCover title={book.title} coverUrl={book.coverUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium">{book.title}</p>
                  <p className="truncate text-sm text-ink-secondary">
                    {book.authors.join(", ")}
                  </p>
                </div>
                {userBook.currentPage > 0 && (
                  <span className="nums shrink-0 text-sm text-ink-tertiary">
                    p.{userBook.currentPage}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <BottomSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        label="서재 필터"
      >
        <div className="px-2 pt-1">
          {genreOptions.length > 0 && (
            <>
              <h2 className="px-1 text-xs font-semibold tracking-wide text-ink-tertiary uppercase">
                장르
              </h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {genreOptions.map((genre) => (
                  <button
                    key={genre}
                    type="button"
                    aria-pressed={selectedGenres.includes(genre)}
                    onClick={() => toggleValue(selectedGenres, setSelectedGenres, genre)}
                    className={filterChipClass(selectedGenres.includes(genre))}
                  >
                    {genre}
                  </button>
                ))}
              </div>
            </>
          )}

          {authorOptions.length > 0 && (
            <>
              <h2 className="mt-4 px-1 text-xs font-semibold tracking-wide text-ink-tertiary uppercase">
                저자
              </h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {authorOptions.map((author) => (
                  <button
                    key={author}
                    type="button"
                    aria-pressed={selectedAuthors.includes(author)}
                    onClick={() => toggleValue(selectedAuthors, setSelectedAuthors, author)}
                    className={filterChipClass(selectedAuthors.includes(author))}
                  >
                    {author}
                  </button>
                ))}
              </div>
            </>
          )}

          <h2 className="mt-4 px-1 text-xs font-semibold tracking-wide text-ink-tertiary uppercase">
            별점
          </h2>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {MIN_RATING_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={minRating === option}
                onClick={() => setMinRating(option)}
                className={`cursor-pointer rounded-xl px-2 py-2 text-[13px] font-medium transition-colors duration-150 ${
                  minRating === option ? "bg-accent text-accent-ink" : "bg-fill text-ink-secondary"
                }`}
              >
                {option === 0 ? "전체" : `★${option} 이상`}
              </button>
            ))}
          </div>

          <div className="mt-5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFilterSheetOpen(false)}
              className="flex-1 cursor-pointer rounded-xl bg-accent py-2.5 text-[15px] font-semibold text-accent-ink"
            >
              {filteredItems.length}권 보기
            </button>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="shrink-0 cursor-pointer px-2 py-2 text-[13px] font-medium text-ink-tertiary transition-colors duration-150 hover:text-ink active:opacity-70"
              >
                초기화
              </button>
            )}
          </div>
        </div>
      </BottomSheet>
    </main>
  );
}
