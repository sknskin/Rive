"use client";

import { useState } from "react";
import { motion } from "motion/react";
import BookCover from "@/components/BookCover";
import { DEFAULT_START_PAGE } from "@/lib/constants";

interface StartPageConfirmProps {
  title: string;
  authors: string[];
  coverUrl: string;
  suggestedPage: number;
  starting: boolean;
  onStart: (startPage: number) => void;
}

// 시작 페이지 확인 — 지난 기록을 이어가되 언제든 수정 가능 (스펙 §7)
// Start-page confirmation — continue from the last record, editable anytime (spec §7)
export default function StartPageConfirm({
  title,
  authors,
  coverUrl,
  suggestedPage,
  starting,
  onStart,
}: StartPageConfirmProps) {
  const [editing, setEditing] = useState(false);
  const [pageText, setPageText] = useState(String(suggestedPage));

  const parsed = Number.parseInt(pageText, 10);
  const validPage = Number.isFinite(parsed) && parsed >= DEFAULT_START_PAGE;

  return (
    <div className="flex flex-col items-center px-2 pt-4 text-center">
      <BookCover title={title} coverUrl={coverUrl} size="md" />
      <h3 className="mt-4 text-lg font-semibold tracking-tight">{title}</h3>
      {authors.length > 0 && (
        <p className="mt-0.5 text-sm text-ink-secondary">{authors.join(", ")}</p>
      )}

      {editing ? (
        <div className="mt-6 flex items-baseline gap-1.5">
          <span className="text-ink-secondary">p.</span>
          <input
            type="number"
            inputMode="numeric"
            autoFocus
            value={pageText}
            min={DEFAULT_START_PAGE}
            onChange={(event) => setPageText(event.target.value)}
            className="nums w-24 rounded-lg bg-fill px-3 py-2 text-center text-xl font-semibold outline-none focus:ring-2 focus:ring-tint"
          />
          <span className="text-ink-secondary">부터</span>
        </div>
      ) : (
        <div className="mt-6 flex items-baseline gap-2">
          <p className="nums text-xl font-semibold">
            {suggestedPage === DEFAULT_START_PAGE
              ? `p.${suggestedPage}부터 시작`
              : `p.${suggestedPage}에서 계속`}
          </p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-sm font-medium text-tint"
          >
            수정
          </button>
        </div>
      )}

      <motion.button
        type="button"
        whileTap={{ scale: 0.97 }}
        disabled={starting || (editing && !validPage)}
        onClick={() => onStart(editing && validPage ? parsed : suggestedPage)}
        className="mt-8 w-full cursor-pointer rounded-2xl bg-accent py-4 text-lg font-semibold tracking-wide text-accent-ink shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {starting ? "시작하는 중…" : "읽기 시작"}
      </motion.button>
    </div>
  );
}
