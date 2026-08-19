"use client";

import { useState } from "react";
import { motion } from "motion/react";
import BookCover from "@/components/BookCover";
import BottomSheet from "@/components/BottomSheet";
import BookSearch from "@/components/read/BookSearch";
import StartPageConfirm from "@/components/read/StartPageConfirm";
import { DEFAULT_START_PAGE } from "@/lib/constants";
import { enrichBookMeta } from "@/lib/enrichBook";
import { useStartReading } from "@/lib/hooks/useStartReading";
import { notifyLibraryChange } from "@/lib/libraryEvents";
import { getRepository } from "@/lib/repository";
import type { BookSearchResult, BookStatus } from "@/lib/types";

const DONE_CLOSE_DELAY_MS = 900;

// 전역 책 추가 Sheet — 어느 메뉴에서든 검색해서 읽기 시작/서재 등록/관심 등록
// Global add-book sheet — search then start reading / add to library / want-to-read from anywhere
type SheetView =
  | { kind: "search" }
  | { kind: "actions"; result: BookSearchResult }
  | { kind: "confirmPage"; result: BookSearchResult }
  | { kind: "done"; message: string };

interface AddBookSheetProps {
  open: boolean;
  onClose: () => void;
}

export default function AddBookSheet({ open, onClose }: AddBookSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} label="책 추가">
      {/* 닫히면 언마운트되어 상태가 초기화된다 */}
      {/* Unmounts on close, resetting state */}
      <AddBookContent onClose={onClose} />
    </BottomSheet>
  );
}

function AddBookContent({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<SheetView>({ kind: "search" });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const { startNewBook } = useStartReading();

  async function handleAddWithStatus(result: BookSearchResult, status: BookStatus) {
    setBusy(true);
    setActionError("");
    try {
      const repository = getRepository();
      const book = await repository.upsertBookByIsbn(result);
      await repository.setBookStatus(book.id, status);
      void enrichBookMeta(book.id);
      notifyLibraryChange();
      setView({
        kind: "done",
        message: status === "want" ? "읽고 싶은 책에 담았어요" : "읽는 중에 추가했어요",
      });
      setTimeout(onClose, DONE_CLOSE_DELAY_MS);
    } catch (error) {
      console.error("[AddBook] failed to add book:", error);
      setActionError("책을 추가하지 못했어요. 다시 시도해 주세요.");
      setBusy(false);
    }
  }

  async function handleStartReading(result: BookSearchResult, startPage: number) {
    setBusy(true);
    setActionError("");
    try {
      await startNewBook(result, startPage);
      // 책 생성이 끝난 뒤에 알린다 (순서 역전 방지)
      // Notify only after the book actually exists (avoids the ordering bug)
      notifyLibraryChange();
      onClose();
    } catch (error) {
      console.error("[AddBook] failed to start reading:", error);
      setActionError("독서를 시작하지 못했어요. 다시 시도해 주세요.");
      setBusy(false);
    }
  }

  if (view.kind === "search") {
    return (
      <div>
        <h2 className="px-3 pt-2 pb-3 text-lg font-semibold tracking-tight">책 추가</h2>
        <BookSearch onSelect={(result) => setView({ kind: "actions", result })} />
      </div>
    );
  }

  if (view.kind === "actions") {
    const { result } = view;
    return (
      <div className="flex flex-col items-center px-2 pt-4 text-center">
        <BookCover title={result.title} coverUrl={result.coverUrl} size="md" />
        <h3 className="mt-4 text-lg font-semibold tracking-tight break-keep">{result.title}</h3>
        {result.authors.length > 0 && (
          <p className="mt-0.5 text-sm text-ink-secondary">{result.authors.join(", ")}</p>
        )}

        {actionError !== "" && <p className="mt-3 text-sm text-danger">{actionError}</p>}

        <div className="mt-6 flex w-full flex-col gap-2.5">
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            disabled={busy}
            onClick={() => setView({ kind: "confirmPage", result })}
            className="w-full cursor-pointer rounded-2xl bg-accent py-3.5 text-[15px] font-semibold text-accent-ink disabled:opacity-40"
          >
            바로 읽기 시작
          </motion.button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleAddWithStatus(result, "reading")}
            className="w-full cursor-pointer rounded-2xl bg-fill py-3.5 text-[15px] font-semibold disabled:opacity-40"
          >
            읽는 중으로 추가
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleAddWithStatus(result, "want")}
            className="w-full cursor-pointer rounded-2xl bg-fill py-3.5 text-[15px] font-semibold text-tint disabled:opacity-40"
          >
            읽고 싶어요
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setView({ kind: "search" })}
            className="w-full cursor-pointer py-2 text-sm font-medium text-ink-tertiary"
          >
            다른 책 찾기
          </button>
        </div>
      </div>
    );
  }

  if (view.kind === "confirmPage") {
    const { result } = view;
    return (
      <>
        <StartPageConfirm
          title={result.title}
          authors={result.authors}
          coverUrl={result.coverUrl}
          suggestedPage={DEFAULT_START_PAGE}
          starting={busy}
          onStart={(startPage) => void handleStartReading(result, startPage)}
        />
        {actionError !== "" && (
          <p className="mt-3 text-center text-sm text-danger">{actionError}</p>
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col items-center px-2 py-10 text-center">
      <p className="text-2xl">✓</p>
      <p className="mt-2 text-[15px] font-medium">{view.message}</p>
    </div>
  );
}
