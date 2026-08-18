"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import ReadSheet from "@/components/read/ReadSheet";
import ThemeSheet from "@/components/ThemeSheet";
import CurrentlyReading from "@/components/today/CurrentlyReading";
import TodaySessions, { type SessionRow } from "@/components/today/TodaySessions";
import { dayRange, greetingForHour } from "@/lib/format";
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
  const [themeOpen, setThemeOpen] = useState(false);

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
  }, [router, readOpen]);

  const greeting = greetingForHour(new Date().getHours());

  return (
    <main
      className={`flex-1 px-5 pt-16 pb-36 transition-opacity duration-300 ${
        ready ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-[15px] text-ink-secondary">{greeting}.</p>
        <button
          type="button"
          aria-label="화면 모드 설정"
          onClick={() => setThemeOpen(true)}
          className="-mr-1.5 flex size-8 items-center justify-center rounded-full text-ink-tertiary active:bg-fill"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          >
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 3.5v17" />
            <path d="M12 3.5a8.5 8.5 0 0 1 0 17" fill="currentColor" stroke="none" />
          </svg>
        </button>
      </div>

      {loadError !== "" && <p className="mt-6 text-sm text-danger">{loadError}</p>}

      {current ? (
        <div className="mt-8">
          <CurrentlyReading book={current.book} userBook={current.userBook} />
        </div>
      ) : (
        ready &&
        loadError === "" && (
          <div className="mt-16 text-center">
            <p className="text-xl font-semibold tracking-tight">
              첫 책과 함께 시작해 보세요.
            </p>
            <p className="mt-2 text-[15px] text-ink-secondary">
              READ를 누르면 바로 읽기 시작할 수 있어요.
            </p>
          </div>
        )
      )}

      <motion.button
        type="button"
        whileTap={{ scale: 0.97 }}
        onClick={() => setReadOpen(true)}
        className="mt-10 w-full rounded-2xl bg-accent py-4 text-lg font-semibold tracking-wide text-accent-ink shadow-sm"
      >
        READ
      </motion.button>

      <div className="mt-12">
        {rows.length > 0 ? (
          <TodaySessions rows={rows} />
        ) : (
          ready &&
          loadError === "" && (
            <p className="text-center text-sm text-ink-tertiary">
              오늘 아직 읽은 기록이 없어요.
            </p>
          )
        )}
      </div>

      <ReadSheet open={readOpen} onClose={() => setReadOpen(false)} />
      <ThemeSheet open={themeOpen} onClose={() => setThemeOpen(false)} />
    </main>
  );
}
