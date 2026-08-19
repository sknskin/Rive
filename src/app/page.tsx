"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import ReadSheet from "@/components/read/ReadSheet";
import CurrentlyReading from "@/components/today/CurrentlyReading";
import TodaySessions, { type SessionRow } from "@/components/today/TodaySessions";
import {
  dayRange,
  formatDurationShort,
  formatPageRange,
  formatTodayHeadingDate,
  greetingForDate,
} from "@/lib/format";
import { subscribeLibraryChange } from "@/lib/libraryEvents";
import { getRepository } from "@/lib/repository";
import type { Book, UserBook } from "@/lib/types";

interface CurrentPick {
  book: Book;
  userBook: UserBook;
}

// 과거의 오늘 — 같은 날짜의 지난해 기록 (스펙 §28)
// On this day — past years' records for the same date (spec §28)
interface PastToday {
  yearsAgo: number;
  rows: SessionRow[];
}

const PAST_TODAY_MAX_YEARS = 5;

export default function TodayPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [hasAnyBook, setHasAnyBook] = useState(false);
  const [current, setCurrent] = useState<CurrentPick | null>(null);
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [pastToday, setPastToday] = useState<PastToday | null>(null);
  const [loadError, setLoadError] = useState("");
  const [readOpen, setReadOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [reloadKey, setReloadKey] = useState(0);

  // 전역 + 버튼으로 책이 추가되면 Currently Reading을 즉시 갱신한다
  // Refresh Currently Reading in place after a global book add
  useEffect(() => {
    return subscribeLibraryChange(() => setReloadKey((key) => key + 1));
  }, []);

  // 인사말이 시간대 경계를 넘으면 실시간으로 바뀌도록 1분마다 갱신한다
  // Refresh every minute so the greeting changes live across slot boundaries
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const repository = getRepository();
      try {
        // 진행 중 세션이 있으면 Reading Mode로 복귀시킨다 (스펙 §9 복구)
        // If a session is in progress, return the user to Reading Mode (spec §9 recovery)
        const active = await repository.getActiveSession();
        if (active) {
          router.replace("/read");
          return;
        }

        // 최초 실행 판정용 — 상태와 무관하게 서재에 책이 하나라도 있는지 본다
        // For first-run detection — check whether the library has any book at all
        const allUserBooks = await repository.listUserBooks();

        const readingBooks = await repository.listUserBooksByStatus("reading");
        let pick: CurrentPick | null = null;
        if (readingBooks.length > 0) {
          const book = await repository.getBook(readingBooks[0].bookId);
          if (book) {
            pick = { book, userBook: readingBooks[0] };
          }
        }

        const today = new Date();
        const { startMs, endMs } = dayRange(today);
        const sessions = await repository.listSessionsByDateRange(startMs, endMs);
        // 세션별 개별 조회 대신 배치 조회로 N+1을 피한다 (6차 조사 D3)
        // Batch-load books instead of per-session lookups to avoid N+1 (audit 6 D3)
        const todayBooks = await repository.listBooksByIds(
          sessions.map((session) => session.bookId),
        );
        const sessionRows: SessionRow[] = sessions.map((session) => ({
          session,
          bookTitle: todayBooks.get(session.bookId)?.title ?? "알 수 없는 책",
        }));

        // 과거의 오늘 — 가장 최근 연도의 기록 하나만 보여준다 (스펙 §28)
        // On this day — surface the most recent past year that has records (spec §28)
        let loadedPast: PastToday | null = null;
        for (let yearsAgo = 1; yearsAgo <= PAST_TODAY_MAX_YEARS; yearsAgo++) {
          const pastRange = dayRange(
            new Date(today.getFullYear() - yearsAgo, today.getMonth(), today.getDate()),
          );
          const pastSessions = await repository.listSessionsByDateRange(
            pastRange.startMs,
            pastRange.endMs,
          );
          if (pastSessions.length > 0) {
            const pastBooks = await repository.listBooksByIds(
              pastSessions.map((session) => session.bookId),
            );
            loadedPast = {
              yearsAgo,
              rows: pastSessions.map((session) => ({
                session,
                bookTitle: pastBooks.get(session.bookId)?.title ?? "알 수 없는 책",
              })),
            };
            break;
          }
        }

        if (!cancelled) {
          setHasAnyBook(allUserBooks.length > 0);
          setCurrent(pick);
          setRows(sessionRows);
          setPastToday(loadedPast);
          setLoadError("");
          setReady(true);
        }
      } catch (error) {
        console.error("[Today] failed to load:", error);
        if (!cancelled) {
          setLoadError("기록을 불러오지 못했어요. 새로고침해 주세요.");
          setReady(true);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [router, readOpen, reloadKey]);

  const greeting = greetingForDate(now);

  // 오늘 기록도 과거의 오늘도 없으면 우측 컬럼 없이 단일 컬럼을 중앙에 배치한다
  // With no sessions today and no past-today, drop the right column and center a single column
  const hasTodayContent = rows.length > 0 || pastToday !== null;

  // 최초 실행 상태 — 서재가 완전히 비어 있고 기록도 없을 때만 전용 히어로를 보여준다
  // ("책 검색부터"라는 히어로 카피가 서재 보유자에게는 사실과 어긋나기 때문)
  // First-run state — the dedicated hero shows only when the library is truly empty,
  // because its "starts from search" copy would be wrong for users who already have books
  const isFresh =
    ready && loadError === "" && !hasAnyBook && current === null && !hasTodayContent;

  if (isFresh) {
    return (
      <main className="flex flex-1 flex-col px-5 pt-8 pb-20 opacity-100 transition-opacity duration-300">
        <div className="m-auto flex w-full max-w-md flex-col items-center pb-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-fill">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-7 text-ink-secondary"
              aria-hidden
            >
              <path d="M12 5.5C10.5 4 8.5 3.5 6 3.5c-1 0-2 .12-3 .4V19c1-.28 2-.4 3-.4 2.5 0 4.5.5 6 1.9 1.5-1.4 3.5-1.9 6-1.9 1 0 2 .12 3 .4V3.9c-1-.28-2-.4-3-.4-2.5 0-4.5.5-6 2z" />
              <path d="M12 5.5v15" />
            </svg>
          </div>
          {/* 빌드 시점 날짜가 프리렌더에 박히므로 하이드레이션 텍스트 경고를 억제한다 */}
          {/* Prerender bakes the build-time date, so suppress the hydration text warning */}
          <p
            suppressHydrationWarning
            className="nums mt-6 text-[13px] font-semibold tracking-wide text-ink-tertiary"
          >
            {formatTodayHeadingDate(now)}
          </p>
          <h1 className="mt-2 text-[28px] leading-snug font-bold tracking-tight break-keep lg:text-[32px]">
            오늘의 첫 페이지,
            <br />
            같이 열어볼까요?
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-secondary">
            READ를 누르면 책 검색부터
            <br />
            기록까지 한 번에 시작돼요
          </p>
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={() => setReadOpen(true)}
            className="mt-10 w-full max-w-xs cursor-pointer rounded-2xl bg-accent py-4 text-lg font-semibold tracking-wide text-accent-ink shadow-sm transition-opacity hover:opacity-90"
          >
            READ
          </motion.button>
        </div>

        <ReadSheet open={readOpen} onClose={() => setReadOpen(false)} />
      </main>
    );
  }

  return (
    <main
      className={`flex-1 px-5 pt-8 pb-20 transition-opacity duration-300 ${
        ready ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className={hasTodayContent ? "" : "lg:mx-auto lg:max-w-xl"}>
      {/* 헤더 — 날짜 캡션 + 인사말 헤드라인 계층 (스펙 §0-2 Content First) */}
      {/* Header — date caption over the greeting headline (spec §0-2 Content First) */}
      <header>
        {/* 빌드 시점 날짜/인사말이 프리렌더에 박히므로 하이드레이션 텍스트 경고를 억제한다 */}
        {/* Prerender bakes the build-time date/greeting, so suppress hydration text warnings */}
        <p
          suppressHydrationWarning
          className="nums text-[13px] font-semibold tracking-wide text-ink-tertiary"
        >
          {formatTodayHeadingDate(now)}
        </p>
        <h1
          suppressHydrationWarning
          className="mt-1.5 text-[26px] leading-snug font-bold tracking-tight break-keep lg:text-[30px]"
        >
          {greeting}
        </h1>
      </header>

      {loadError !== "" && <p className="mt-6 text-sm text-danger">{loadError}</p>}

      {/* 데스크톱: 좌측 현재 책+READ / 우측 오늘의 기록 2단 배치 */}
      {/* Desktop: two columns — current book + READ left, today's sessions right */}
      <div className={hasTodayContent ? "lg:grid lg:grid-cols-2 lg:items-start lg:gap-14" : ""}>
        <div>
          {current ? (
            <div className="mt-10">
              <CurrentlyReading book={current.book} userBook={current.userBook} />
            </div>
          ) : (
            ready &&
            loadError === "" && (
              <div className="mt-14 text-center lg:mt-10 lg:text-left">
                <p className="text-[17px] font-semibold tracking-tight">
                  다음 책과 함께
                  <br />
                  이어가 볼까요?
                </p>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-secondary">
                  아래 READ를 누르면
                  <br />
                  바로 독서가 시작돼요
                </p>
              </div>
            )
          )}

          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={() => setReadOpen(true)}
            className="mt-10 w-full cursor-pointer rounded-2xl bg-accent py-4 text-lg font-semibold tracking-wide text-accent-ink shadow-sm transition-opacity hover:opacity-90"
          >
            READ
          </motion.button>
        </div>

        {hasTodayContent && (
        <div className="mt-12 lg:mt-8">
          {rows.length > 0 && <TodaySessions rows={rows} />}

          {pastToday && (
            <section className="mt-10" aria-label="과거의 오늘">
              <h2 className="text-xs font-semibold tracking-wide text-ink-tertiary uppercase">
                {pastToday.yearsAgo}년 전 오늘
              </h2>
              <ul className="mt-2 divide-y divide-separator">
                {pastToday.rows.map(({ session, bookTitle }) => (
                  <li key={session.id} className="py-3">
                    <p className="text-[15px] font-medium">{bookTitle}</p>
                    <p className="nums mt-0.5 text-sm text-ink-secondary">
                      {formatDurationShort(session.durationSeconds)} ·{" "}
                      {formatPageRange(session.startPage, session.endPage)}
                    </p>
                    {session.memo !== "" && (
                      <p className="mt-1 text-sm break-keep text-ink-tertiary">
                        {session.memo}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        )}
      </div>
      </div>

      <ReadSheet open={readOpen} onClose={() => setReadOpen(false)} />
    </main>
  );
}
