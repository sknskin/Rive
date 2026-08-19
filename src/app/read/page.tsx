"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import PageSkeleton from "@/components/PageSkeleton";
import BottomSheet from "@/components/BottomSheet";
import RatingStars from "@/components/library/RatingStars";
import EndPageSheet from "@/components/read/EndPageSheet";
import Stopwatch from "@/components/read/Stopwatch";
import { EXTRA_RATING_ITEMS, MIN_SESSION_SECONDS } from "@/lib/constants";
import { hapticSuccess, hapticTap } from "@/lib/haptics";
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
  // 완독 직후 별점을 바로 받는다 — AI 취향 분석의 핵심 입력 (스펙 §25, BACKLOG P0-C)
  // Prompt for a rating right after finishing — key input for AI analysis (spec §25)
  const [ratingBookId, setRatingBookId] = useState<string | null>(null);
  // 별점 후 선택적 추가 평가 단계 (스펙 §25 — 한꺼번에 강제하지 않는다)
  // Optional extra-evaluation step after the star rating (spec §25)
  const [extraStep, setExtraStep] = useState(false);
  const [extraRatings, setExtraRatings] = useState<Record<string, number>>({});
  // 같은 저장을 재시도할 때 동일 PK를 보내 네트워크 결과가 모호해도 중복 세션을 만들지 않는다.
  // Reuse one PK across retries so an ambiguous network result cannot create a duplicate session.
  const saveIdentityRef = useRef<{ id: string; createdAt: number } | null>(null);

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

    hapticTap();
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
    saveIdentityRef.current ??= { id: crypto.randomUUID(), createdAt: Date.now() };

    try {
      await repository.saveSessionAtomic({
        session: {
          ...saveIdentityRef.current,
          bookId: active.bookId,
          startedAt: active.startedAt,
          endedAt: stoppedAt,
          durationSeconds,
          startPage: active.startPage,
          endPage: input.endPage,
          pagesRead,
          memo: input.memo,
        },
        progressMode: "always",
        markAsRead: input.markAsRead,
        clearActiveSession: true,
      });
      hapticSuccess();
      if (input.markAsRead) {
        // 완독이면 홈 복귀 전에 별점 시트를 먼저 보여준다
        // On finish, show the rating sheet before returning home
        setEndSheetOpen(false);
        setSaving(false);
        setRatingBookId(active.bookId);
        return;
      }
      router.replace("/");
    } catch (error) {
      // 저장 실패 시 입력값을 유지한 채 에러를 보여준다
      // Keep the user's input and surface the error when saving fails
      console.error("[ReadPage] failed to save session:", error);
      setSaveError("기록을 저장하지 못했어요. 다시 시도해 주세요.");
      setSaving(false);
    }
  }

  async function handleRatingSave(rating: number) {
    if (!ratingBookId) {
      return;
    }
    try {
      await getRepository().updateUserBook(ratingBookId, { rating });
      setExtraStep(true);
    } catch (error) {
      console.error("[ReadPage] failed to save rating:", error);
      // 별점 저장이 실패해도 완독 처리는 끝났으므로 홈으로 보낸다
      // Finishing already succeeded, so return home even if the rating fails
      router.replace("/");
    }
  }

  async function handleExtraDone() {
    if (!ratingBookId) {
      return;
    }
    try {
      if (Object.keys(extraRatings).length > 0) {
        await getRepository().updateUserBook(ratingBookId, { extraRatings });
      }
      router.replace("/");
    } catch (error) {
      console.error("[ReadPage] failed to save extra ratings:", error);
      router.replace("/");
    }
  }

  if (!active) {
    return <PageSkeleton />;
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
        onDiscard={() => void handleDiscard()}
      />

      <BottomSheet
        open={ratingBookId !== null}
        onClose={() => router.replace("/")}
        label="완독 평가"
      >
        {!extraStep ? (
          <div className="px-2 pt-2 text-center">
            <h2 className="text-lg font-semibold tracking-tight">한 권을 다 읽었어요, 축하해요</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
              이 책, 어땠나요?
              <br />
              별점은 취향 분석에 큰 도움이 돼요
            </p>
            <div className="mt-5">
              <RatingStars rating={0} onChange={(rating) => void handleRatingSave(rating)} />
            </div>
            <button
              type="button"
              onClick={() => router.replace("/")}
              className="mt-6 w-full cursor-pointer py-2 text-sm font-medium text-ink-tertiary"
            >
              나중에 할게요
            </button>
          </div>
        ) : (
          <div className="px-2 pt-2 text-center">
            <h2 className="text-lg font-semibold tracking-tight">조금만 더 알려줄래요?</h2>
            <p className="mt-2 text-sm text-ink-secondary">전부 선택이에요, 편하게 넘겨도 돼요</p>
            <div className="mt-5 flex flex-col gap-4">
              {EXTRA_RATING_ITEMS.map((item) => (
                <div key={item.key} className="flex items-center justify-between">
                  <span className="text-[15px] font-medium">{item.label}</span>
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button
                        key={value}
                        type="button"
                        aria-label={`${item.label} ${value}점`}
                        onClick={() =>
                          setExtraRatings((previous) => ({ ...previous, [item.key]: value }))
                        }
                        className={`nums size-8 cursor-pointer rounded-full text-[13px] font-semibold transition-colors duration-150 ${
                          (extraRatings[item.key] ?? 0) >= value
                            ? "bg-accent text-accent-ink"
                            : "bg-fill text-ink-tertiary"
                        }`}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void handleExtraDone()}
              className="mt-7 w-full cursor-pointer rounded-2xl bg-accent py-3.5 text-[15px] font-semibold text-accent-ink"
            >
              완료
            </button>
          </div>
        )}
      </BottomSheet>

      <BottomSheet
        open={shortWarnOpen}
        onClose={() => setShortWarnOpen(false)}
        label="짧은 세션 안내"
      >
        <div className="px-2 pt-2 text-center">
          <h2 className="text-lg font-semibold tracking-tight">아직 기록이 짧아요.</h2>
          <p className="mt-2 text-[15px] text-ink-secondary">
            방금 시작했어요. 어떻게 할까요?
          </p>
          <div className="mt-6 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={handleResume}
              className="w-full cursor-pointer rounded-2xl bg-accent py-3.5 text-[15px] font-semibold text-accent-ink"
            >
              이어서 읽기
            </button>
            <button
              type="button"
              onClick={() => void handleDiscard()}
              className="w-full cursor-pointer rounded-2xl bg-fill py-3.5 text-[15px] font-semibold text-danger"
            >
              기록하지 않고 종료
            </button>
          </div>
        </div>
      </BottomSheet>
    </main>
  );
}
