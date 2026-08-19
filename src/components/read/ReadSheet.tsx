"use client";

import { useEffect, useState } from "react";
import BookCover from "@/components/BookCover";
import BottomSheet from "@/components/BottomSheet";
import BookSearch from "@/components/read/BookSearch";
import StartPageConfirm from "@/components/read/StartPageConfirm";
import { DEFAULT_START_PAGE } from "@/lib/constants";
import { useStartReading } from "@/lib/hooks/useStartReading";
import { getRepository } from "@/lib/repository";
import type { Book, BookSearchResult } from "@/lib/types";

// READ Sheet의 화면 상태 — 선택 → (검색) → 시작 페이지 확인
// READ sheet view state — pick → (search) → start-page confirmation
type SheetView =
  | { kind: "pick" }
  | { kind: "search" }
  | { kind: "confirmExisting"; book: Book; nextPage: number }
  | { kind: "confirmNew"; result: BookSearchResult };

interface ReadingPick {
  book: Book;
  nextPage: number;
}

interface ReadSheetProps {
  open: boolean;
  onClose: () => void;
}

// READ는 특정 책에 종속되지 않은 Global Action이다 (스펙 §2, §4)
// READ is a global action, not tied to a specific book (spec §2, §4)
export default function ReadSheet({ open, onClose }: ReadSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose}>
      {/* 시트가 닫히면 내용이 언마운트되어 상태가 자연스럽게 초기화된다 */}
      {/* Content unmounts when the sheet closes, resetting state naturally */}
      <ReadSheetContent onClose={onClose} />
    </BottomSheet>
  );
}

function ReadSheetContent({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<SheetView>({ kind: "pick" });
  const [picks, setPicks] = useState<ReadingPick[]>([]);
  const [wantPicks, setWantPicks] = useState<ReadingPick[]>([]);
  const [loadError, setLoadError] = useState("");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const { startExistingBook, startNewBook } = useStartReading();

  useEffect(() => {
    let cancelled = false;

    async function loadPicks() {
      try {
        const repository = getRepository();
        const readingBooks = await repository.listUserBooksByStatus("reading");
        const loaded: ReadingPick[] = [];
        for (const userBook of readingBooks) {
          const book = await repository.getBook(userBook.bookId);
          if (book) {
            loaded.push({
              book,
              nextPage: Math.max(userBook.currentPage, DEFAULT_START_PAGE),
            });
          }
        }

        // Want to Read 책도 바로 시작할 수 있게 함께 보여준다 (스펙 §4)
        // Also surface want-to-read books for instant starts (spec §4)
        const wantBooks = await repository.listUserBooksByStatus("want");
        const loadedWant: ReadingPick[] = [];
        for (const userBook of wantBooks) {
          const book = await repository.getBook(userBook.bookId);
          if (book) {
            loadedWant.push({
              book,
              nextPage: Math.max(userBook.currentPage, DEFAULT_START_PAGE),
            });
          }
        }

        if (!cancelled) {
          setPicks(loaded);
          setWantPicks(loadedWant);
        }
      } catch (error) {
        console.error("[ReadSheet] failed to load reading books:", error);
        if (!cancelled) {
          setLoadError("읽던 책을 불러오지 못했어요.");
        }
      }
    }

    void loadPicks();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleStart(action: () => Promise<void>) {
    setStarting(true);
    setStartError("");
    try {
      await action();
      onClose();
    } catch (error) {
      console.error("[ReadSheet] failed to start reading:", error);
      setStartError("독서를 시작하지 못했어요. 다시 시도해 주세요.");
      setStarting(false);
    }
  }

  const continuePick = picks[0];
  const otherPicks = picks.slice(1);

  return (
    <div>
      {view.kind === "pick" && (
        <div className="px-2">
          <h2 className="px-1 pt-2 text-lg font-semibold tracking-tight">무엇을 읽을까요?</h2>

          {loadError !== "" && (
            <p className="py-2 text-center text-sm text-danger">{loadError}</p>
          )}

          {continuePick && (
            <section className="mt-4">
              <h3 className="px-1 text-xs font-semibold tracking-wide text-ink-tertiary uppercase">
                Continue Reading
              </h3>
              <button
                type="button"
                onClick={() =>
                  setView({
                    kind: "confirmExisting",
                    book: continuePick.book,
                    nextPage: continuePick.nextPage,
                  })
                }
                className="mt-2 flex w-full items-center gap-4 rounded-xl p-2 text-left active:bg-fill"
              >
                <BookCover
                  title={continuePick.book.title}
                  coverUrl={continuePick.book.coverUrl}
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[17px] font-semibold tracking-tight">
                    {continuePick.book.title}
                  </p>
                  <p className="nums mt-1 text-sm text-ink-secondary">
                    {continuePick.nextPage === DEFAULT_START_PAGE
                      ? "처음부터"
                      : `p.${continuePick.nextPage}에서 계속`}
                  </p>
                </div>
              </button>
            </section>
          )}

          {otherPicks.length > 0 && (
            <section className="mt-5">
              <h3 className="px-1 text-xs font-semibold tracking-wide text-ink-tertiary uppercase">
                Reading
              </h3>
              <ul className="mt-1">
                {otherPicks.map((pick) => (
                  <li key={pick.book.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setView({
                          kind: "confirmExisting",
                          book: pick.book,
                          nextPage: pick.nextPage,
                        })
                      }
                      className="flex w-full items-center gap-3.5 rounded-xl p-2 text-left active:bg-fill"
                    >
                      <BookCover title={pick.book.title} coverUrl={pick.book.coverUrl} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-medium">{pick.book.title}</p>
                        <p className="nums text-sm text-ink-secondary">p.{pick.nextPage}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {wantPicks.length > 0 && (
            <section className="mt-5">
              <h3 className="px-1 text-xs font-semibold tracking-wide text-ink-tertiary uppercase">
                Want to Read
              </h3>
              <ul className="mt-1">
                {wantPicks.map((pick) => (
                  <li key={pick.book.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setView({
                          kind: "confirmExisting",
                          book: pick.book,
                          nextPage: pick.nextPage,
                        })
                      }
                      className="flex w-full items-center gap-3.5 rounded-xl p-2 text-left active:bg-fill"
                    >
                      <BookCover title={pick.book.title} coverUrl={pick.book.coverUrl} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-medium">{pick.book.title}</p>
                        <p className="truncate text-sm text-ink-secondary">
                          {pick.book.authors.join(", ")}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {picks.length === 0 && wantPicks.length === 0 && loadError === "" && (
            <div className="px-1 py-8 text-center">
              <p className="text-[15px] font-semibold">지금 읽고 있는 책이 없네요</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
                아래에서 새로운 책을 찾아
                <br />
                바로 시작해봐요
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={() => setView({ kind: "search" })}
            className="mt-5 w-full rounded-2xl bg-fill py-3.5 text-[15px] font-semibold text-tint active:opacity-70"
          >
            새로운 책 찾기
          </button>
        </div>
      )}

      {view.kind === "search" && (
        <div>
          <h2 className="px-3 pt-2 pb-3 text-lg font-semibold tracking-tight">새로운 책 찾기</h2>
          <BookSearch onSelect={(result) => setView({ kind: "confirmNew", result })} />
        </div>
      )}

      {view.kind === "confirmExisting" && (
        <>
          <StartPageConfirm
            title={view.book.title}
            authors={view.book.authors}
            coverUrl={view.book.coverUrl}
            suggestedPage={view.nextPage}
            starting={starting}
            onStart={(startPage) =>
              void handleStart(() => startExistingBook(view.book.id, startPage))
            }
          />
          {startError !== "" && (
            <p className="mt-3 text-center text-sm text-danger">{startError}</p>
          )}
        </>
      )}

      {view.kind === "confirmNew" && (
        <>
          <StartPageConfirm
            title={view.result.title}
            authors={view.result.authors}
            coverUrl={view.result.coverUrl}
            suggestedPage={DEFAULT_START_PAGE}
            starting={starting}
            onStart={(startPage) => void handleStart(() => startNewBook(view.result, startPage))}
          />
          {startError !== "" && (
            <p className="mt-3 text-center text-sm text-danger">{startError}</p>
          )}
        </>
      )}
    </div>
  );
}
