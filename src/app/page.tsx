"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import ReadSheet from "@/components/read/ReadSheet";
import CurrentlyReading from "@/components/today/CurrentlyReading";
import TodaySessions, { type SessionRow } from "@/components/today/TodaySessions";
import { dayRange, greetingForDate } from "@/lib/format";
import { subscribeLibraryChange } from "@/lib/libraryEvents";
import { getRepository } from "@/lib/repository";
import type { Book, UserBook } from "@/lib/types";

interface CurrentPick {
  book: Book;
  userBook: UserBook;
}

export default function TodayPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [current, setCurrent] = useState<CurrentPick | null>(null);
  const [rows, setRows] = useState<SessionRow[]>([]);
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

        const readingBooks = await repository.listUserBooksByStatus("reading");
        let pick: CurrentPick | null = null;
        if (readingBooks.length > 0) {
          const book = await repository.getBook(readingBooks[0].bookId);
          if (book) {
            pick = { book, userBook: readingBooks[0] };
          }
        }

        const { startMs, endMs } = dayRange(new Date());
        const sessions = await repository.listSessionsByDateRange(startMs, endMs);
        const sessionRows: SessionRow[] = [];
        for (const session of sessions) {
          const book = await repository.getBook(session.bookId);
          sessionRows.push({ session, bookTitle: book?.title ?? "알 수 없는 책" });
        }

        if (!cancelled) {
          setCurrent(pick);
          setRows(sessionRows);
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

  return (
    <main
      className={`flex-1 px-5 pt-8 pb-20 transition-opacity duration-300 ${
        ready ? "opacity-100" : "opacity-0"
      }`}
    >
      <p className="text-[15px] text-ink-secondary">{greeting}</p>

      {loadError !== "" && <p className="mt-6 text-sm text-danger">{loadError}</p>}

      {/* 데스크톱: 좌측 현재 책+READ / 우측 오늘의 기록 2단 배치 */}
      {/* Desktop: two columns — current book + READ left, today's sessions right */}
      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-14">
        <div>
          {current ? (
            <div className="mt-8">
              <CurrentlyReading book={current.book} userBook={current.userBook} />
            </div>
          ) : (
            ready &&
            loadError === "" && (
              <div className="mt-16 text-center lg:mt-8 lg:text-left">
                <p className="text-xl font-semibold tracking-tight">
                  오늘의 첫 페이지,
                  <br />
                  같이 열어볼까요?
                </p>
                <p className="mt-3 text-[15px] leading-relaxed text-ink-secondary">
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
            className="mt-10 w-full cursor-pointer rounded-2xl bg-accent py-4 text-lg font-semibold tracking-wide text-accent-ink shadow-sm"
          >
            READ
          </motion.button>
        </div>

        <div className="mt-12 lg:mt-8">
          {rows.length > 0 ? (
            <TodaySessions rows={rows} />
          ) : (
            ready &&
            loadError === "" && (
              <div className="text-center lg:text-left">
                <p className="text-[15px] font-medium text-ink-secondary">
                  오늘은 아직 기록이 없어요
                </p>
                <p className="mt-2 text-sm leading-relaxed text-ink-tertiary">
                  짧게 한 장이라도 괜찮아요, 그게 시작이에요
                </p>
              </div>
            )
          )}
        </div>
      </div>

      <ReadSheet open={readOpen} onClose={() => setReadOpen(false)} />
    </main>
  );
}
