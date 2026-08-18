"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "motion/react";
import BookCover from "@/components/BookCover";
import RatingStars from "@/components/library/RatingStars";
import StatusSheet from "@/components/library/StatusSheet";
import ManualSessionSheet from "@/components/read/ManualSessionSheet";
import { DEFAULT_START_PAGE, STATUS_LABELS } from "@/lib/constants";
import {
  formatDurationShort,
  formatPageRange,
  formatShortDate,
  formatTimeOfDay,
} from "@/lib/format";
import { useStartReading } from "@/lib/hooks/useStartReading";
import { getRepository } from "@/lib/repository";
import type { Book, BookStatus, ReadingSession, UserBook } from "@/lib/types";

// Book Detail — 표지와 책 정보 우선, 개인 기록은 그 아래 (스펙 §22–24)
// Book detail — cover and book info first, personal data below (spec §22–24)
export default function BookDetailPage() {
  const params = useParams<{ bookId: string }>();
  const router = useRouter();
  const { startExistingBook } = useStartReading();

  const [book, setBook] = useState<Book | null>(null);
  const [userBook, setUserBook] = useState<UserBook | null>(null);
  const [sessions, setSessions] = useState<ReadingSession[]>([]);
  const [ready, setReady] = useState(false);
  const [pageError, setPageError] = useState("");
  const [statusSheetOpen, setStatusSheetOpen] = useState(false);
  const [manualSheetOpen, setManualSheetOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const repository = getRepository();
      try {
        const loadedBook = await repository.getBook(params.bookId);
        if (!loadedBook) {
          router.replace("/library");
          return;
        }
        const loadedUserBook = await repository.getUserBook(params.bookId);
        const loadedSessions = await repository.listSessionsForBook(params.bookId);
        if (!cancelled) {
          setBook(loadedBook);
          setUserBook(loadedUserBook ?? null);
          setSessions(loadedSessions);
          setPageError("");
          setReady(true);
        }
      } catch (error) {
        console.error("[BookDetail] failed to load:", error);
        if (!cancelled) {
          setPageError("책 정보를 불러오지 못했어요.");
          setReady(true);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [params.bookId, router, reloadKey]);

  async function handleStatusChange(status: BookStatus, dnfReason?: string) {
    if (!book) {
      return;
    }
    const repository = getRepository();
    try {
      await repository.setBookStatus(book.id, status);
      if (status === "dnf" && dnfReason) {
        await repository.updateUserBook(book.id, { dnfReason });
      }
      setStatusSheetOpen(false);
      setReloadKey((key) => key + 1);
    } catch (error) {
      console.error("[BookDetail] failed to change status:", error);
      setPageError("상태를 변경하지 못했어요. 다시 시도해 주세요.");
    }
  }

  async function handleRatingChange(rating: number) {
    if (!book) {
      return;
    }
    try {
      await getRepository().updateUserBook(book.id, { rating });
      setReloadKey((key) => key + 1);
    } catch (error) {
      console.error("[BookDetail] failed to save rating:", error);
      setPageError("별점을 저장하지 못했어요. 다시 시도해 주세요.");
    }
  }

  async function handleRead() {
    if (!book) {
      return;
    }
    try {
      const nextPage = Math.max(userBook?.currentPage ?? 0, DEFAULT_START_PAGE);
      await startExistingBook(book.id, nextPage);
    } catch (error) {
      console.error("[BookDetail] failed to start reading:", error);
      setPageError("독서를 시작하지 못했어요. 다시 시도해 주세요.");
    }
  }

  if (!ready || !book) {
    return <main className="flex-1" />;
  }

  const totalSeconds = sessions.reduce((sum, session) => sum + session.durationSeconds, 0);
  const totalPages = sessions.reduce((sum, session) => sum + session.pagesRead, 0);
  const progressPercent =
    book.pageCount > 0 && userBook
      ? Math.min(100, Math.round((userBook.currentPage / book.pageCount) * 100))
      : null;

  return (
    <main className="flex-1 px-5 pt-6 pb-36">
      <button
        type="button"
        aria-label="뒤로"
        onClick={() => router.back()}
        className="-ml-2 flex size-9 items-center justify-center rounded-full text-xl text-tint active:bg-fill"
      >
        ‹
      </button>

      {pageError !== "" && <p className="mt-4 text-sm text-danger">{pageError}</p>}

      <div className="mt-4 flex flex-col items-center text-center">
        <BookCover title={book.title} coverUrl={book.coverUrl} size="lg" />
        <h1 className="mt-5 text-xl font-bold tracking-tight break-keep">{book.title}</h1>
        {book.authors.length > 0 && (
          <p className="mt-1 text-[15px] text-ink-secondary">{book.authors.join(", ")}</p>
        )}
        <p className="mt-0.5 text-sm text-ink-tertiary">
          {book.publisher}
          {book.pageCount > 0 && ` · ${book.pageCount}쪽`}
        </p>

        {userBook && (
          <button
            type="button"
            onClick={() => setStatusSheetOpen(true)}
            className="mt-4 rounded-full bg-fill px-4 py-1.5 text-[13px] font-semibold text-ink-secondary active:opacity-70"
          >
            {STATUS_LABELS[userBook.status]}
            {userBook.status === "dnf" && userBook.dnfReason && ` · ${userBook.dnfReason}`}
            <span className="ml-1 text-ink-tertiary">›</span>
          </button>
        )}

        {userBook?.status === "read" && (
          <div className="mt-3">
            <RatingStars
              rating={userBook.rating ?? 0}
              onChange={(rating) => void handleRatingChange(rating)}
            />
          </div>
        )}

        {progressPercent !== null && userBook && userBook.currentPage > 0 && (
          <div className="mt-4 w-full max-w-60">
            <p className="nums text-sm text-ink-secondary">
              p.{userBook.currentPage} / {book.pageCount} · {progressPercent}%
            </p>
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-fill">
              <div
                className="h-full rounded-full bg-ink transition-[width] duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={() => void handleRead()}
          className="mt-6 w-full rounded-2xl bg-accent py-4 text-lg font-semibold tracking-wide text-accent-ink"
        >
          READ
        </motion.button>
      </div>

      <div className="nums mt-8 grid grid-cols-3 divide-x divide-separator border-y border-separator py-4 text-center">
        <div>
          <p className="text-lg font-semibold">{formatDurationShort(totalSeconds)}</p>
          <p className="mt-0.5 text-xs text-ink-tertiary">총 독서 시간</p>
        </div>
        <div>
          <p className="text-lg font-semibold">{sessions.length}</p>
          <p className="mt-0.5 text-xs text-ink-tertiary">기록</p>
        </div>
        <div>
          <p className="text-lg font-semibold">{totalPages}</p>
          <p className="mt-0.5 text-xs text-ink-tertiary">읽은 페이지</p>
        </div>
      </div>

      <section className="mt-8" aria-label="독서 타임라인">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-semibold tracking-wide text-ink-tertiary uppercase">
            Timeline
          </h2>
          <button
            type="button"
            onClick={() => setManualSheetOpen(true)}
            className="text-sm font-medium text-tint active:opacity-70"
          >
            + 기록 추가
          </button>
        </div>

        {sessions.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-tertiary">
            아직 기록이 없어요. READ로 시작해 보세요.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-separator">
            {userBook?.startedAt !== null && userBook?.startedAt !== undefined && (
              <li className="py-3 text-sm text-ink-secondary">
                <span className="nums font-medium text-ink">
                  {formatShortDate(userBook.startedAt)}
                </span>
                <span className="ml-2">읽기 시작</span>
              </li>
            )}
            {sessions.map((session) => (
              <li key={session.id} className="py-3.5">
                <div className="nums flex items-baseline justify-between text-sm">
                  <span className="font-medium">
                    {formatShortDate(session.startedAt)}
                    <span className="ml-2 text-ink-secondary">
                      {formatTimeOfDay(session.startedAt)} – {formatTimeOfDay(session.endedAt)}
                    </span>
                  </span>
                  <span className="font-medium">
                    {formatDurationShort(session.durationSeconds)}
                  </span>
                </div>
                <div className="nums mt-0.5 flex items-baseline justify-between text-sm text-ink-secondary">
                  <span>{formatPageRange(session.startPage, session.endPage)}</span>
                  <span>{session.pagesRead} pages</span>
                </div>
                {session.memo !== "" && (
                  <p className="mt-1.5 text-sm break-keep text-ink-secondary">{session.memo}</p>
                )}
              </li>
            ))}
            {userBook?.status === "read" && userBook.finishedAt !== null && (
              <li className="py-3 text-sm">
                <span className="nums font-medium">{formatShortDate(userBook.finishedAt)}</span>
                <span className="ml-2 text-ink-secondary">완독</span>
                {userBook.rating !== undefined && userBook.rating > 0 && (
                  <span className="ml-2 text-tint">
                    {"★".repeat(userBook.rating)}
                  </span>
                )}
              </li>
            )}
          </ul>
        )}
      </section>

      {userBook && (
        <StatusSheet
          open={statusSheetOpen}
          currentStatus={userBook.status}
          onClose={() => setStatusSheetOpen(false)}
          onSelect={(status, dnfReason) => void handleStatusChange(status, dnfReason)}
        />
      )}

      <ManualSessionSheet
        open={manualSheetOpen}
        onClose={() => setManualSheetOpen(false)}
        onSaved={() => setReloadKey((key) => key + 1)}
        fixedBookId={book.id}
      />
    </main>
  );
}
