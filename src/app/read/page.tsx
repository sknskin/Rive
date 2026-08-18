"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import BottomSheet from "@/components/BottomSheet";
import EndPageSheet from "@/components/read/EndPageSheet";
import Stopwatch from "@/components/read/Stopwatch";
import { MIN_SESSION_SECONDS } from "@/lib/constants";
import { getRepository } from "@/lib/repository";
import type { ActiveSession, Book } from "@/lib/types";

const MS_PER_SECOND = 1000;

// Reading Mode — 한 가지 행동에 집중하는 몰입 화면 (스펙 §8)
// Reading Mode — an immersive screen focused on a single action (spec §8)
export default function ReadPage() {
  const router = useRouter();
  const [active, setActive] = useState<ActiveSession | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [stoppedAt, setStoppedAt] = useState<number | null>(null);
  const [endSheetOpen, setEndSheetOpen] = useState(false);
  const [shortWarnOpen, setShortWarnOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const repository = getRepository();
      try {
        const session = await repository.getActiveSession();
        if (!session) {
          router.replace("/");
          return;
        }
        const sessionBook = await repository.getBook(session.bookId);
        if (!cancelled) {
          setActive(session);
          setBook(sessionBook ?? null);
        }
      } catch (error) {
        console.error("[ReadPage] failed to load active session:", error);
        if (!cancelled) {
          router.replace("/");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  function handleStop() {
    if (!active) {
      return;
    }
    const now = Date.now();
    const elapsedSeconds = (now - active.startedAt) / MS_PER_SECOND;

    // 오조작으로 보이는 초단위 기록은 저장 전에 의사를 확인한다
    // Confirm intent before saving a seconds-long, likely accidental record
    if (elapsedSeconds < MIN_SESSION_SECONDS) {
      setShortWarnOpen(true);
      return;
    }

    setStoppedAt(now);
    setEndSheetOpen(true);
  }

  function handleResume() {
    setShortWarnOpen(false);
    setStoppedAt(null);
    setEndSheetOpen(false);
  }

  async function handleDiscard() {
    try {
      await getRepository().clearActiveSession();
      router.replace("/");
    } catch (error) {
      console.error("[ReadPage] failed to discard session:", error);
      setSaveError("세션을 정리하지 못했어요. 다시 시도해 주세요.");
    }
  }

  async function handleSave(input: { endPage: number; memo: string; markAsRead: boolean }) {
    if (!active || stoppedAt === null) {
      return;
    }
    setSaving(true);
    setSaveError("");

    const repository = getRepository();
    const durationSeconds = Math.round((stoppedAt - active.startedAt) / MS_PER_SECOND);
    const pagesRead = Math.max(0, input.endPage - active.startPage);

    try {
      await repository.addSession({
        bookId: active.bookId,
        startedAt: active.startedAt,
        endedAt: stoppedAt,
        durationSeconds,
        startPage: active.startPage,
        endPage: input.endPage,
        pagesRead,
        memo: input.memo,
      });
      await repository.touchLastRead(active.bookId, input.endPage, stoppedAt);
      if (input.markAsRead) {
        await repository.setBookStatus(active.bookId, "read");
      }
      await repository.clearActiveSession();
      router.replace("/");
    } catch (error) {
      // 저장 실패 시 입력값을 유지한 채 에러를 보여준다
      // Keep the user's input and surface the error when saving fails
      console.error("[ReadPage] failed to save session:", error);
      setSaveError("기록을 저장하지 못했어요. 다시 시도해 주세요.");
      setSaving(false);
    }
  }

  if (!active) {
    return <main className="flex-1" />;
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="flex w-full flex-col items-center"
      >
        <p className="max-w-xs text-lg font-semibold tracking-tight break-keep">
          {book?.title ?? "책"}
        </p>
        <p className="nums mt-1 text-sm text-ink-secondary">p.{active.startPage}부터</p>

        <div className="mt-14">
          <Stopwatch startedAt={active.startedAt} stoppedAt={stoppedAt} />
        </div>

        <motion.button
          type="button"
          whileTap={{ scale: 0.94 }}
          onClick={handleStop}
          className="mt-16 flex size-20 items-center justify-center rounded-full bg-danger/12 text-[15px] font-semibold text-danger ring-1 ring-danger/25"
        >
          STOP
        </motion.button>
      </motion.div>

      <EndPageSheet
        open={endSheetOpen}
        onClose={handleResume}
        durationSeconds={
          stoppedAt !== null ? Math.round((stoppedAt - active.startedAt) / MS_PER_SECOND) : 0
        }
        startPage={active.startPage}
        pageCount={book?.pageCount ?? 0}
        saving={saving}
        saveError={saveError}
        onSave={(input) => void handleSave(input)}
      />

      <BottomSheet open={shortWarnOpen} onClose={() => setShortWarnOpen(false)}>
        <div className="px-2 pt-2 text-center">
          <h2 className="text-lg font-semibold tracking-tight">아직 기록이 짧아요.</h2>
          <p className="mt-2 text-[15px] text-ink-secondary">
            방금 시작했어요. 어떻게 할까요?
          </p>
          <div className="mt-6 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={handleResume}
              className="w-full rounded-2xl bg-accent py-3.5 text-[15px] font-semibold text-accent-ink"
            >
              이어서 읽기
            </button>
            <button
              type="button"
              onClick={() => void handleDiscard()}
              className="w-full rounded-2xl bg-fill py-3.5 text-[15px] font-semibold text-danger"
            >
              기록하지 않고 종료
            </button>
          </div>
        </div>
      </BottomSheet>
    </main>
  );
}
