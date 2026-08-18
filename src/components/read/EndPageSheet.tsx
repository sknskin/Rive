"use client";

import { useState } from "react";
import { motion } from "motion/react";
import BottomSheet from "@/components/BottomSheet";
import { formatDurationShort } from "@/lib/format";

interface EndPageSheetProps {
  open: boolean;
  onClose: () => void;
  durationSeconds: number;
  startPage: number;
  pageCount: number;
  saving: boolean;
  saveError: string;
  onSave: (input: { endPage: number; memo: string; markAsRead: boolean }) => void;
}

// 종료 페이지 입력 — 사용자가 입력할 유일한 필수 값 (스펙 §11)
// End-page input — the only required value the user must enter (spec §11)
export default function EndPageSheet({
  open,
  onClose,
  durationSeconds,
  startPage,
  pageCount,
  saving,
  saveError,
  onSave,
}: EndPageSheetProps) {
  const [pageText, setPageText] = useState("");
  const [memo, setMemo] = useState("");
  const [markAsRead, setMarkAsRead] = useState(true);

  const parsed = Number.parseInt(pageText, 10);
  const validPage = Number.isFinite(parsed) && parsed >= startPage;
  const reachedEnd = validPage && pageCount > 0 && parsed >= pageCount;

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="px-2 pt-2 text-center">
        <h2 className="text-lg font-semibold tracking-tight">독서를 마쳤어요.</h2>
        <p className="nums mt-3 text-3xl font-light">{formatDurationShort(durationSeconds)}</p>
        <p className="nums mt-1 text-sm text-ink-secondary">p.{startPage}에서 시작</p>

        <div className="mt-7 text-left">
          <label htmlFor="end-page" className="text-sm font-medium text-ink-secondary">
            몇 페이지까지 읽었나요?
          </label>
          <input
            id="end-page"
            type="number"
            inputMode="numeric"
            autoFocus
            min={startPage}
            value={pageText}
            onChange={(event) => setPageText(event.target.value)}
            placeholder={String(startPage)}
            className="nums mt-2 w-full rounded-xl bg-fill px-4 py-3.5 text-center text-2xl font-semibold outline-none placeholder:text-ink-tertiary focus:ring-2 focus:ring-tint"
          />
          {pageText !== "" && !validPage && (
            <p className="mt-1.5 text-sm text-danger">
              시작 페이지(p.{startPage})보다 큰 숫자를 입력해 주세요.
            </p>
          )}

          {reachedEnd && (
            <label className="mt-4 flex items-center justify-between rounded-xl bg-fill px-4 py-3">
              <span className="text-[15px] font-medium">이 책을 다 읽었어요</span>
              <input
                type="checkbox"
                checked={markAsRead}
                onChange={(event) => setMarkAsRead(event.target.checked)}
                className="size-5 accent-current"
              />
            </label>
          )}

          <textarea
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            placeholder="메모 추가 (선택)"
            rows={2}
            className="mt-4 w-full resize-none rounded-xl bg-fill px-4 py-3 text-[15px] outline-none placeholder:text-ink-tertiary focus:ring-2 focus:ring-tint"
          />
        </div>

        {saveError !== "" && <p className="mt-3 text-sm text-danger">{saveError}</p>}

        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          disabled={!validPage || saving}
          onClick={() =>
            onSave({
              endPage: parsed,
              memo: memo.trim(),
              markAsRead: reachedEnd && markAsRead,
            })
          }
          className="mt-6 w-full rounded-2xl bg-accent py-4 text-lg font-semibold text-accent-ink disabled:opacity-40"
        >
          {saving ? "저장하는 중…" : "저장"}
        </motion.button>
      </div>
    </BottomSheet>
  );
}
