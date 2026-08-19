"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "motion/react";
import PageSkeleton from "@/components/PageSkeleton";
import BookCover from "@/components/BookCover";
import BottomSheet from "@/components/BottomSheet";
import NotesQuotes from "@/components/library/NotesQuotes";
import RatingStars from "@/components/library/RatingStars";
import StatusSheet from "@/components/library/StatusSheet";
import ManualSessionSheet from "@/components/read/ManualSessionSheet";
import { recomputeBookProgress } from "@/lib/bookProgress";
import { DEFAULT_START_PAGE, EXTRA_RATING_ITEMS, STATUS_LABELS } from "@/lib/constants";
import { enrichBookMeta } from "@/lib/enrichBook";
import { notifyLibraryChange } from "@/lib/libraryEvents";
import {
  formatDateInput,
  formatDurationShort,
  formatPageRange,
  formatShortDate,
  formatTimeOfDay,
} from "@/lib/format";
import { useStartReading } from "@/lib/hooks/useStartReading";
import { estimateDaysToFinish } from "@/lib/insights";
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
  const [descExpanded, setDescExpanded] = useState(false);
  const [daysToFinish, setDaysToFinish] = useState<number | null>(null);
  const [loadedAtMs, setLoadedAtMs] = useState(0);
  // 세션 액션(수정/삭제)과 책 제거 확인 상태 (BACKLOG P0-B)
  // Session action (edit/delete) and book-removal confirmation state (BACKLOG P0-B)
  const [sessionAction, setSessionAction] = useState<ReadingSession | null>(null);
  const [editTarget, setEditTarget] = useState<ReadingSession | null>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [removeSheetOpen, setRemoveSheetOpen] = useState(false);
  const [removeArmed, setRemoveArmed] = useState(false);
  // 저장 진행 중 가드 — 조작 연타로 인한 중복 실행 방지 (6차 조사 D1)
  // In-flight guard — prevents duplicate mutations from rapid taps (audit 6 D1)
  const [busy, setBusy] = useState(false);
  // Reading Plan — 완독 목표일 설정 (스펙 §82)
  // Reading plan — target finish date (spec §82)
  const [planSheetOpen, setPlanSheetOpen] = useState(false);
  // 페이지 수 수동 입력 — 메타 보강 실패/전자책 대응 (리서치 C3, 전자책은 100 입력 시 % 기록)
  // Manual page-count entry — covers failed enrichment and e-books (enter 100 to track by %)
  const [pageCountSheetOpen, setPageCountSheetOpen] = useState(false);
  const [pageCountText, setPageCountText] = useState("");
  const [planDateText, setPlanDateText] = useState("");
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

        // 첫 페인트를 막지 않도록 메타 백필은 백그라운드로 돌리고, 성공 시에만 다시 그린다
        // Backfill runs in the background so it never blocks first paint; redraw only on success
        void enrichBookMeta(loadedBook.id).then((enriched) => {
          if (enriched && !cancelled) {
            setReloadKey((key) => key + 1);
          }
        });
        // 서로 독립적인 조회는 병렬로 실행한다 (6차 조사 D4)
        // Run independent reads in parallel (audit 6 D4)
        const [loadedUserBook, loadedSessions] = await Promise.all([
          repository.getUserBook(params.bookId),
          repository.listSessionsForBook(params.bookId),
        ]);
        if (!cancelled) {
          setBook(loadedBook);
          setUserBook(loadedUserBook ?? null);
          setSessions(loadedSessions);
          // 예상 완독일 — 읽는 중일 때만 최근 페이스 기반으로 계산 (스펙 §35)
          // Days-to-finish estimate — recent-pace based, only while reading (spec §35)
          setDaysToFinish(
            loadedUserBook?.status === "reading"
              ? estimateDaysToFinish(
                  loadedSessions,
                  loadedUserBook.currentPage,
                  loadedBook.pageCount,
                  Date.now(),
                )
              : null,
          );
          setLoadedAtMs(Date.now());
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

  // busy 가드 — 저장이 끝나기 전 같은 조작이 중복 실행되는 것을 막는다 (6차 조사 D1)
  // busy guard — blocks duplicate mutations while one is still in flight (audit 6 D1)
  async function handleStatusChange(status: BookStatus, dnfReason?: string) {
    if (!book || busy) {
      return;
    }
    setBusy(true);
    const repository = getRepository();
    try {
      await repository.setBookStatus(book.id, status);
      if (status === "dnf" && dnfReason) {
        await repository.updateUserBook(book.id, { dnfReason });
      }
      notifyLibraryChange();
      setStatusSheetOpen(false);
      setReloadKey((key) => key + 1);
    } catch (error) {
      console.error("[BookDetail] failed to change status:", error);
      setPageError("상태를 변경하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRatingChange(rating: number) {
    if (!book || busy) {
      return;
    }
    setBusy(true);
    try {
      await getRepository().updateUserBook(book.id, { rating });
      notifyLibraryChange();
      setReloadKey((key) => key + 1);
    } catch (error) {
      console.error("[BookDetail] failed to save rating:", error);
      setPageError("별점을 저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleUpNext() {
    if (!book || !userBook || busy) {
      return;
    }
    setBusy(true);
    try {
      await getRepository().updateUserBook(book.id, {
        upNextAt: userBook.upNextAt === undefined ? Date.now() : undefined,
      });
      notifyLibraryChange();
      setReloadKey((key) => key + 1);
    } catch (error) {
      console.error("[BookDetail] failed to toggle up-next:", error);
      setPageError("Up Next 설정에 실패했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveTargetDate(clear: boolean) {
    if (!book || busy) {
      return;
    }
    setBusy(true);
    try {
      const targetDate = clear ? undefined : new Date(`${planDateText}T23:59`).getTime();
      if (!clear && !Number.isFinite(targetDate)) {
        return;
      }
      await getRepository().updateUserBook(book.id, { targetDate });
      setPlanSheetOpen(false);
      setReloadKey((key) => key + 1);
    } catch (error) {
      console.error("[BookDetail] failed to save target date:", error);
      setPageError("목표일을 저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteSession(session: ReadingSession) {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      const repository = getRepository();
      await repository.deleteSession(session.id);
      // 삭제 후 남은 기록 기준으로 진행 상태를 재계산한다
      // Recompute progress from remaining records after deletion
      await recomputeBookProgress(session.bookId);
      notifyLibraryChange();
      setSessionAction(null);
      setDeleteArmed(false);
      setReloadKey((key) => key + 1);
    } catch (error) {
      console.error("[BookDetail] failed to delete session:", error);
      setPageError("기록을 삭제하지 못했어요. 다시 시도해 주세요.");
      setSessionAction(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveBook() {
    if (!book || busy) {
      return;
    }
    setBusy(true);
    try {
      await getRepository().removeBookCompletely(book.id);
      notifyLibraryChange();
      router.replace("/library");
    } catch (error) {
      console.error("[BookDetail] failed to remove book:", error);
      setPageError("책을 제거하지 못했어요. 다시 시도해 주세요.");
      setRemoveSheetOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function handleSavePageCount() {
    if (!book || busy) {
      return;
    }
    const parsed = Number.parseInt(pageCountText, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return;
    }
    setBusy(true);
    try {
      await getRepository().updateBookMeta(book.id, { pageCount: parsed });
      notifyLibraryChange();
      setPageCountSheetOpen(false);
      setReloadKey((key) => key + 1);
    } catch (error) {
      console.error("[BookDetail] failed to save page count:", error);
      setPageError("페이지 수를 저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRead() {
    if (!book || busy) {
      return;
    }
    setBusy(true);
    try {
      const nextPage = Math.max(userBook?.currentPage ?? 0, DEFAULT_START_PAGE);
      await startExistingBook(book.id, nextPage);
    } catch (error) {
      console.error("[BookDetail] failed to start reading:", error);
      setPageError("독서를 시작하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  if (!ready || !book) {
    return <PageSkeleton />;
  }

  const totalSeconds = sessions.reduce((sum, session) => sum + session.durationSeconds, 0);
  const totalPages = sessions.reduce((sum, session) => sum + session.pagesRead, 0);
  const progressPercent =
    book.pageCount > 0 && userBook
      ? Math.min(100, Math.round((userBook.currentPage / book.pageCount) * 100))
      : null;
  return (
    <main className="flex-1 px-5 pt-6 pb-20">
      <button
        type="button"
        aria-label="뒤로"
        onClick={() => router.back()}
        className="-ml-2 flex size-9 cursor-pointer items-center justify-center rounded-full text-xl text-tint active:bg-fill"
      >
        ‹
      </button>

      {pageError !== "" && <p className="mt-4 text-sm text-danger">{pageError}</p>}

      {/* 데스크톱: 좌측 책 정보+READ / 우측 기록·소개·타임라인 2단 배치 */}
      {/* Desktop: two columns — book info + READ left, records/about/timeline right */}
      <div className="lg:grid lg:grid-cols-[minmax(0,400px)_1fr] lg:items-start lg:gap-14">
      <div className="mt-4 flex flex-col items-center text-center lg:sticky lg:top-16">
        <BookCover title={book.title} coverUrl={book.coverUrl} size="lg" />
        <h1 className="mt-5 text-xl font-bold tracking-tight break-keep">{book.title}</h1>
        {book.authors.length > 0 && (
          <p className="mt-1 text-[15px] text-ink-secondary">{book.authors.join(", ")}</p>
        )}
        <p className="mt-0.5 text-sm text-ink-tertiary">
          {book.publisher}
          {book.pageCount > 0 && ` · ${book.pageCount}쪽`}
          {(book.kakaoUrl !== "" || book.googleBooksId !== "") && (
            <>
              {" · "}
              <a
                href={
                  book.kakaoUrl !== ""
                    ? book.kakaoUrl
                    : `https://books.google.com/books?id=${book.googleBooksId}`
                }
                target="_blank"
                rel="noreferrer"
                className="cursor-pointer text-tint hover:underline active:opacity-70"
              >
                책 정보 ↗
              </a>
            </>
          )}
        </p>

        {/* 페이지 수가 없으면 직접 입력 경로 제공 — 완독 플로우·진행률 활성화 (리서치 C3) */}
        {/* Manual page-count entry when missing — unlocks finish flow and progress (C3) */}
        {book.pageCount === 0 && (
          <button
            type="button"
            onClick={() => {
              setPageCountText("");
              setPageCountSheetOpen(true);
            }}
            className="mt-1 cursor-pointer text-sm font-medium text-tint active:opacity-70"
          >
            페이지 수 입력
          </button>
        )}

        {book.categories && book.categories.length > 0 && (
          <div className="mt-2 flex flex-wrap justify-center gap-1.5">
            {book.categories.map((category) => (
              <span
                key={category}
                className="rounded-full bg-fill px-2.5 py-1 text-xs font-medium text-ink-secondary"
              >
                {category}
              </span>
            ))}
          </div>
        )}

        {userBook && (
          <button
            type="button"
            onClick={() => setStatusSheetOpen(true)}
            className="mt-4 cursor-pointer rounded-full bg-fill px-4 py-1.5 text-[13px] font-semibold text-ink-secondary active:opacity-70"
          >
            {STATUS_LABELS[userBook.status]}
            {userBook.status === "dnf" && userBook.dnfReason && ` · ${userBook.dnfReason}`}
            <span className="ml-1 text-ink-tertiary">›</span>
          </button>
        )}

        {userBook?.status === "want" && (
          <button
            type="button"
            onClick={() => void handleToggleUpNext()}
            className={`mt-3 cursor-pointer rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors duration-150 active:opacity-70 ${
              userBook.upNextAt !== undefined
                ? "bg-accent text-accent-ink"
                : "bg-fill text-tint"
            }`}
          >
            {userBook.upNextAt !== undefined ? "Up Next ✓" : "Up Next에 추가"}
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
            {daysToFinish !== null && (
              <p className="nums mt-2 text-sm text-ink-tertiary">
                현재 속도라면 약 {daysToFinish}일 후 완독 예상
              </p>
            )}
            {userBook.status === "reading" && book.pageCount > 0 && (
              <PlanLine
                targetDate={userBook.targetDate}
                remainingPages={book.pageCount - userBook.currentPage}
                nowMs={loadedAtMs}
                onOpen={() => {
                  setPlanDateText(
                    userBook.targetDate
                      ? formatDateInput(new Date(userBook.targetDate))
                      : "",
                  );
                  setPlanSheetOpen(true);
                }}
              />
            )}
          </div>
        )}

        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={() => void handleRead()}
          className="mt-6 w-full cursor-pointer rounded-2xl bg-accent py-4 text-lg font-semibold tracking-wide text-accent-ink shadow-sm transition-opacity hover:opacity-90"
        >
          READ
        </motion.button>
      </div>

      <div className="lg:mt-4">
      <div className="nums mt-8 grid grid-cols-3 divide-x divide-separator border-y border-separator py-4 text-center lg:mt-0">
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

      {book.description && book.description !== "" && (
        <section className="mt-8" aria-label="책 소개">
          <h2 className="text-xs font-semibold tracking-wide text-ink-tertiary uppercase">
            About
          </h2>
          <p
            className={`mt-2 text-[15px] leading-relaxed break-keep text-ink-secondary ${
              descExpanded ? "" : "line-clamp-4"
            }`}
          >
            {book.description}
          </p>
          <button
            type="button"
            onClick={() => setDescExpanded((expanded) => !expanded)}
            className="mt-1.5 cursor-pointer text-sm font-medium text-tint active:opacity-70"
          >
            {descExpanded ? "접기" : "더보기"}
          </button>
        </section>
      )}

      <NotesQuotes bookId={book.id} />

      <section className="mt-8" aria-label="독서 타임라인">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-semibold tracking-wide text-ink-tertiary uppercase">
            Timeline
          </h2>
          <button
            type="button"
            onClick={() => setManualSheetOpen(true)}
            className="cursor-pointer text-sm font-medium text-tint active:opacity-70"
          >
            + 기록 추가
          </button>
        </div>

        {/* 세션이 없어도 완독 처리된 책이면 완독 행을 보여줘야 한다 (5차 조사 M6) */}
        {/* Even without sessions, finished books must still show their finish row (audit 5 M6) */}
        {sessions.length === 0 &&
        !(userBook?.status === "read" && userBook.finishedAt !== null) ? (
          <div className="py-10 text-center">
            <p className="text-[15px] font-medium text-ink-secondary">
              아직 이 책의 기록이 없어요
            </p>
            <p className="mt-2 text-sm leading-relaxed text-ink-tertiary">
              READ를 누르는 순간부터
              <br />
              여기에 이야기가 쌓여요
            </p>
          </div>
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
              <li key={session.id}>
                {/* 행을 탭하면 수정/삭제 액션을 제공한다 (BACKLOG P0-B) */}
                {/* Tapping a row offers edit/delete actions (BACKLOG P0-B) */}
                <button
                  type="button"
                  onClick={() => {
                    setDeleteArmed(false);
                    setSessionAction(session);
                  }}
                  className="-mx-2 w-[calc(100%+1rem)] cursor-pointer rounded-xl px-2 py-3.5 text-left transition-colors duration-150 hover:bg-fill/60 active:bg-fill"
                >
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
                </button>
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
                {userBook.extraRatings &&
                  formatExtraRatingsLabel(userBook.extraRatings) !== "" && (
                    <span className="nums ml-2 text-ink-tertiary">
                      {formatExtraRatingsLabel(userBook.extraRatings)}
                    </span>
                  )}
              </li>
            )}
          </ul>
        )}
      </section>
      </div>
      </div>

      <div className="mt-12 text-center">
        <button
          type="button"
          onClick={() => {
            setRemoveArmed(false);
            setRemoveSheetOpen(true);
          }}
          className="cursor-pointer py-1.5 text-sm font-medium text-ink-tertiary transition-colors duration-150 hover:text-danger active:opacity-70"
        >
          서재에서 제거
        </button>
      </div>

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

      {/* 세션 수정 — 기존 기록을 프리필한 수동 기록 시트 재사용 */}
      {/* Session edit — reuses the manual sheet prefilled with the record */}
      <ManualSessionSheet
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        onSaved={() => setReloadKey((key) => key + 1)}
        editSession={editTarget ?? undefined}
      />

      <BottomSheet
        open={sessionAction !== null}
        onClose={() => setSessionAction(null)}
        label="기록 관리"
      >
        {sessionAction && (
          <div className="px-2">
            <h2 className="px-1 pt-2 text-lg font-semibold tracking-tight">
              이 기록을 어떻게 할까요?
            </h2>
            <p className="nums mt-1 px-1 text-sm text-ink-secondary">
              {formatShortDate(sessionAction.startedAt)}{" "}
              {formatTimeOfDay(sessionAction.startedAt)} –{" "}
              {formatTimeOfDay(sessionAction.endedAt)} ·{" "}
              {formatPageRange(sessionAction.startPage, sessionAction.endPage)}
            </p>
            <div className="mt-5 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setEditTarget(sessionAction);
                  setSessionAction(null);
                }}
                className="w-full cursor-pointer rounded-2xl bg-accent py-3.5 text-[15px] font-semibold text-accent-ink"
              >
                수정하기
              </button>
              <button
                type="button"
                onClick={() => {
                  if (deleteArmed) {
                    void handleDeleteSession(sessionAction);
                  } else {
                    setDeleteArmed(true);
                  }
                }}
                className={`w-full cursor-pointer rounded-2xl bg-fill py-3.5 text-[15px] font-semibold transition-colors duration-150 ${
                  deleteArmed ? "text-danger" : "text-ink-secondary"
                }`}
              >
                {deleteArmed ? "한 번 더 누르면 삭제돼요" : "삭제하기"}
              </button>
              <button
                type="button"
                onClick={() => setSessionAction(null)}
                className="w-full cursor-pointer py-2 text-sm font-medium text-ink-tertiary"
              >
                취소
              </button>
            </div>
          </div>
        )}
      </BottomSheet>

      <BottomSheet
        open={planSheetOpen}
        onClose={() => setPlanSheetOpen(false)}
        label="완독 목표일"
      >
        <div className="px-2 pt-2">
          <h2 className="px-1 text-lg font-semibold tracking-tight">언제까지 완독할까요?</h2>
          <input
            type="date"
            value={planDateText}
            min={formatDateInput(new Date(loadedAtMs || 0))}
            onChange={(event) => setPlanDateText(event.target.value)}
            className="nums mt-4 w-full rounded-xl bg-fill px-3.5 py-3 text-[15px] outline-none focus:ring-2 focus:ring-tint"
          />
          <div className="mt-5 flex flex-col gap-2.5">
            <button
              type="button"
              disabled={planDateText === ""}
              onClick={() => void handleSaveTargetDate(false)}
              className="w-full cursor-pointer rounded-2xl bg-accent py-3.5 text-[15px] font-semibold text-accent-ink disabled:opacity-40"
            >
              목표 저장
            </button>
            {userBook?.targetDate !== undefined && (
              <button
                type="button"
                onClick={() => void handleSaveTargetDate(true)}
                className="w-full cursor-pointer py-2 text-sm font-medium text-ink-tertiary"
              >
                목표 해제
              </button>
            )}
          </div>
        </div>
      </BottomSheet>

      <BottomSheet
        open={pageCountSheetOpen}
        onClose={() => setPageCountSheetOpen(false)}
        label="페이지 수 입력"
      >
        <div className="px-2 pt-2">
          <h2 className="px-1 text-lg font-semibold tracking-tight">전체 페이지 수</h2>
          <p className="mt-1 px-1 text-sm text-ink-secondary">
            전자책이라면 100을 입력해 %로 기록할 수 있어요
          </p>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={pageCountText}
            aria-label="전체 페이지 수"
            onChange={(event) => setPageCountText(event.target.value)}
            placeholder="예: 320"
            className="nums mt-4 w-full rounded-xl bg-fill px-3.5 py-3 text-[15px] outline-none placeholder:text-ink-tertiary focus:ring-2 focus:ring-tint"
          />
          <button
            type="button"
            disabled={busy || pageCountText.trim() === ""}
            onClick={() => void handleSavePageCount()}
            className="mt-5 w-full cursor-pointer rounded-2xl bg-accent py-3.5 text-[15px] font-semibold text-accent-ink disabled:opacity-40"
          >
            저장
          </button>
        </div>
      </BottomSheet>

      <BottomSheet
        open={removeSheetOpen}
        onClose={() => setRemoveSheetOpen(false)}
        label="서재에서 제거"
      >
        <div className="px-2 pt-2 text-center">
          <h2 className="text-lg font-semibold tracking-tight">
            이 책을 서재에서 제거할까요?
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
            독서 기록 {sessions.length}개도 함께 삭제되고
            <br />
            되돌릴 수 없어요
          </p>
          <div className="mt-6 flex flex-col gap-2.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (removeArmed) {
                  void handleRemoveBook();
                } else {
                  setRemoveArmed(true);
                }
              }}
              className={`w-full cursor-pointer rounded-2xl py-3.5 text-[15px] font-semibold transition-colors duration-150 disabled:opacity-40 ${
                removeArmed ? "bg-danger text-white" : "bg-fill text-danger"
              }`}
            >
              {removeArmed ? "한 번 더 누르면 제거돼요" : "제거하기"}
            </button>
            <button
              type="button"
              onClick={() => setRemoveSheetOpen(false)}
              className="w-full cursor-pointer py-2 text-sm font-medium text-ink-tertiary"
            >
              취소
            </button>
          </div>
        </div>
      </BottomSheet>
    </main>
  );
}

const MS_PER_DAY = 24 * 3600 * 1000;

// 완독 목표 라인 — 목표일이 있으면 D-day와 하루 필요 페이지를 보여준다 (Reading Plan)
// Target-date line — shows D-day and daily pages needed when a goal exists
function PlanLine({
  targetDate,
  remainingPages,
  nowMs,
  onOpen,
}: {
  targetDate: number | undefined;
  remainingPages: number;
  nowMs: number;
  onOpen: () => void;
}) {
  if (targetDate === undefined) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="mt-1.5 cursor-pointer text-sm font-medium text-tint active:opacity-70"
      >
        완독 목표일 정하기
      </button>
    );
  }

  const daysLeft = Math.max(1, Math.ceil((targetDate - nowMs) / MS_PER_DAY));
  const pagesPerDay = Math.max(1, Math.ceil(remainingPages / daysLeft));
  const target = new Date(targetDate);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="nums mt-1.5 cursor-pointer text-sm text-ink-secondary active:opacity-70"
    >
      목표 {target.getMonth() + 1}월 {target.getDate()}일 · D-{daysLeft} · 하루 {pagesPerDay}쪽
      <span className="ml-1 text-tint">수정</span>
    </button>
  );
}

// 완독 추가 평가를 "재미 4 · 몰입도 5" 형태의 한 줄 라벨로 만든다 (스펙 §25)
// Build a one-line label like "재미 4 · 몰입도 5" from extra finish ratings (spec §25)
function formatExtraRatingsLabel(
  extraRatings: NonNullable<UserBook["extraRatings"]>,
): string {
  return EXTRA_RATING_ITEMS.filter((item) => (extraRatings[item.key] ?? 0) > 0)
    .map((item) => `${item.label} ${extraRatings[item.key]}`)
    .join(" · ");
}
