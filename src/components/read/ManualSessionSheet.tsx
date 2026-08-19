"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import BookCover from "@/components/BookCover";
import BottomSheet from "@/components/BottomSheet";
import BookSearch from "@/components/read/BookSearch";
import { recomputeBookProgress } from "@/lib/bookProgress";
import { DEFAULT_START_PAGE } from "@/lib/constants";
import { enrichBookMeta } from "@/lib/enrichBook";
import { formatDateInput, formatTimeOfDay } from "@/lib/format";
import { notifyLibraryChange } from "@/lib/libraryEvents";
import { getRepository } from "@/lib/repository";
import type { Book, BookSearchResult, ReadingSession } from "@/lib/types";

const MS_PER_SECOND = 1000;

interface ManualSessionSheetProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  // 책이 정해진 화면(Book Detail)에서는 고정, Calendar에서는 선택
  // Fixed on book-scoped screens (Book Detail); pickable from Calendar
  fixedBookId?: string;
  presetDate?: Date;
  // 기존 세션을 넘기면 수정 모드로 동작한다 (BACKLOG P0-B)
  // Passing an existing session switches to edit mode (BACKLOG P0-B)
  editSession?: ReadingSession;
}

interface PickableBook {
  book: Book;
  suggestedPage: number;
}

// 수동 독서 기록 — Stopwatch 없이 읽은 시간을 보조적으로 입력 (스펙 §20)
// Manual reading record — secondary entry for sessions read without the stopwatch (spec §20)
export default function ManualSessionSheet({
  open,
  onClose,
  onSaved,
  fixedBookId,
  presetDate,
  editSession,
}: ManualSessionSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose}>
      <ManualSessionContent
        onClose={onClose}
        onSaved={onSaved}
        fixedBookId={fixedBookId}
        presetDate={presetDate}
        editSession={editSession}
      />
    </BottomSheet>
  );
}

function ManualSessionContent({
  onClose,
  onSaved,
  fixedBookId,
  presetDate,
  editSession,
}: Omit<ManualSessionSheetProps, "open">) {
  const [pickables, setPickables] = useState<PickableBook[]>([]);
  const [selected, setSelected] = useState<PickableBook | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [dateText, setDateText] = useState(
    formatDateInput(editSession ? new Date(editSession.startedAt) : (presetDate ?? new Date())),
  );
  const [startTimeText, setStartTimeText] = useState(
    editSession ? formatTimeOfDay(editSession.startedAt) : "",
  );
  const [endTimeText, setEndTimeText] = useState(
    editSession ? formatTimeOfDay(editSession.endedAt) : "",
  );
  const [startPageText, setStartPageText] = useState(
    editSession ? String(editSession.startPage) : "",
  );
  const [endPageText, setEndPageText] = useState(
    editSession ? String(editSession.endPage) : "",
  );
  const [memo, setMemo] = useState(editSession ? editSession.memo : "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const repository = getRepository();
      try {
        // 수정 모드 — 세션의 책만 로드하고 입력값은 프리필 상태를 유지한다
        // Edit mode — load only the session's book; inputs keep their prefilled values
        if (editSession) {
          const book = await repository.getBook(editSession.bookId);
          if (book && !cancelled) {
            setSelected({ book, suggestedPage: editSession.startPage });
          }
          return;
        }

        if (fixedBookId) {
          const book = await repository.getBook(fixedBookId);
          const userBook = await repository.getUserBook(fixedBookId);
          if (book && !cancelled) {
            const suggestedPage = Math.max(userBook?.currentPage ?? 0, DEFAULT_START_PAGE);
            setSelected({ book, suggestedPage });
            setStartPageText(String(suggestedPage));
          }
          return;
        }

        const userBooks = await repository.listUserBooks();
        const loaded: PickableBook[] = [];
        for (const userBook of userBooks) {
          const book = await repository.getBook(userBook.bookId);
          if (book) {
            loaded.push({
              book,
              suggestedPage: Math.max(userBook.currentPage, DEFAULT_START_PAGE),
            });
          }
        }
        if (!cancelled) {
          setPickables(loaded);
        }
      } catch (error) {
        console.error("[ManualSession] failed to load books:", error);
        if (!cancelled) {
          setLoadError("책 목록을 불러오지 못했어요.");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [fixedBookId, editSession]);

  // 서재에 없는 책은 검색해서 그 자리에서 등록 후 기록을 작성한다
  // Books not yet in the library are registered on the spot from search
  async function handleSearchSelect(result: BookSearchResult) {
    try {
      const repository = getRepository();
      const book = await repository.upsertBookByIsbn(result);
      const existing = await repository.getUserBook(book.id);
      if (!existing) {
        await repository.setBookStatus(book.id, "reading");
      }
      void enrichBookMeta(book.id);
      notifyLibraryChange();
      const suggestedPage = Math.max(existing?.currentPage ?? 0, DEFAULT_START_PAGE);
      setSelected({ book, suggestedPage });
      setStartPageText(String(suggestedPage));
      setSearching(false);
    } catch (error) {
      console.error("[ManualSession] failed to register searched book:", error);
      setLoadError("책을 등록하지 못했어요. 다시 시도해 주세요.");
    }
  }

  const startPage = Number.parseInt(startPageText, 10);
  const endPage = Number.parseInt(endPageText, 10);
  const startedAt =
    dateText !== "" && startTimeText !== ""
      ? new Date(`${dateText}T${startTimeText}`).getTime()
      : Number.NaN;
  const endedAt =
    dateText !== "" && endTimeText !== ""
      ? new Date(`${dateText}T${endTimeText}`).getTime()
      : Number.NaN;

  const timeValid =
    Number.isFinite(startedAt) && Number.isFinite(endedAt) && endedAt > startedAt;
  const pagesValid =
    Number.isFinite(startPage) &&
    Number.isFinite(endPage) &&
    startPage >= DEFAULT_START_PAGE &&
    endPage >= startPage;
  const formValid = selected !== null && timeValid && pagesValid;

  async function handleSave() {
    if (!selected || !formValid) {
      return;
    }
    setSaving(true);
    setSaveError("");

    const repository = getRepository();
    try {
      if (editSession) {
        // 수정 모드 — 세션을 갱신하고 진행 상태를 전체 기록 기준으로 재계산한다
        // Edit mode — update the session, then recompute progress from all records
        await repository.updateSession(editSession.id, {
          startedAt,
          endedAt,
          durationSeconds: Math.round((endedAt - startedAt) / MS_PER_SECOND),
          startPage,
          endPage,
          pagesRead: Math.max(0, endPage - startPage),
          memo: memo.trim(),
        });
        await recomputeBookProgress(editSession.bookId);
      } else {
        await repository.addSession({
          bookId: selected.book.id,
          startedAt,
          endedAt,
          durationSeconds: Math.round((endedAt - startedAt) / MS_PER_SECOND),
          startPage,
          endPage,
          pagesRead: Math.max(0, endPage - startPage),
          memo: memo.trim(),
        });

        // 과거 기록이 최신 진행 상태를 되돌리지 않도록 최신 기록일 때만 갱신한다
        // Only advance progress when this record is newer than the latest one
        const userBook = await repository.getUserBook(selected.book.id);
        if (userBook && endedAt >= userBook.lastReadAt) {
          await repository.touchLastRead(selected.book.id, endPage, endedAt);
        }
      }

      notifyLibraryChange();
      onSaved();
      onClose();
    } catch (error) {
      console.error("[ManualSession] failed to save:", error);
      setSaveError("기록을 저장하지 못했어요. 다시 시도해 주세요.");
      setSaving(false);
    }
  }

  if (!selected && searching) {
    return (
      <div>
        <h2 className="px-3 pt-2 pb-3 text-lg font-semibold tracking-tight">새로운 책 찾기</h2>
        {loadError !== "" && (
          <p className="pb-2 text-center text-sm text-danger">{loadError}</p>
        )}
        <BookSearch onSelect={(result) => void handleSearchSelect(result)} />
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="px-2">
        <h2 className="px-1 pt-2 text-lg font-semibold tracking-tight">
          어떤 책을 읽었나요?
        </h2>
        {loadError !== "" && (
          <p className="py-2 text-center text-sm text-danger">{loadError}</p>
        )}
        {pickables.length === 0 && loadError === "" && (
          <div className="px-1 py-8 text-center">
            <p className="text-[15px] font-semibold">서재에 아직 책이 없어요</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
              아래 검색으로 책을 등록하고
              <br />
              기록까지 한 번에 남겨봐요
            </p>
          </div>
        )}
        <ul className="mt-2">
          {pickables.map((pickable) => (
            <li key={pickable.book.id}>
              <button
                type="button"
                onClick={() => {
                  setSelected(pickable);
                  setStartPageText(String(pickable.suggestedPage));
                }}
                className="flex w-full items-center gap-3.5 rounded-xl p-2 text-left active:bg-fill"
              >
                <BookCover
                  title={pickable.book.title}
                  coverUrl={pickable.book.coverUrl}
                  size="sm"
                />
                <p className="min-w-0 flex-1 truncate text-[15px] font-medium">
                  {pickable.book.title}
                </p>
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setSearching(true)}
          className="mt-4 w-full cursor-pointer rounded-2xl bg-fill py-3.5 text-[15px] font-semibold text-tint active:opacity-70"
        >
          새로운 책 검색
        </button>
      </div>
    );
  }

  const inputClass =
    "w-full rounded-xl bg-fill px-3 py-2.5 text-[15px] outline-none placeholder:text-ink-tertiary focus:ring-2 focus:ring-tint";

  return (
    <div className="px-2">
      <h2 className="px-1 pt-2 text-lg font-semibold tracking-tight">
        {editSession ? "독서 기록 수정" : "독서 기록 추가"}
      </h2>
      <p className="px-1 pt-1 text-sm text-ink-secondary">{selected.book.title}</p>

      <div className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-secondary">
          날짜
          <input
            type="date"
            value={dateText}
            max={formatDateInput(new Date())}
            onChange={(event) => setDateText(event.target.value)}
            className={`nums ${inputClass}`}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-secondary">
            시작 시간
            <input
              type="time"
              value={startTimeText}
              onChange={(event) => setStartTimeText(event.target.value)}
              className={`nums ${inputClass}`}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-secondary">
            종료 시간
            <input
              type="time"
              value={endTimeText}
              onChange={(event) => setEndTimeText(event.target.value)}
              className={`nums ${inputClass}`}
            />
          </label>
        </div>
        {startTimeText !== "" && endTimeText !== "" && !timeValid && (
          <p className="text-sm text-danger">종료 시간이 시작 시간보다 늦어야 해요.</p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-secondary">
            시작 페이지
            <input
              type="number"
              inputMode="numeric"
              min={DEFAULT_START_PAGE}
              value={startPageText}
              onChange={(event) => setStartPageText(event.target.value)}
              className={`nums ${inputClass}`}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-secondary">
            종료 페이지
            <input
              type="number"
              inputMode="numeric"
              min={DEFAULT_START_PAGE}
              value={endPageText}
              onChange={(event) => setEndPageText(event.target.value)}
              className={`nums ${inputClass}`}
            />
          </label>
        </div>
        {startPageText !== "" && endPageText !== "" && !pagesValid && (
          <p className="text-sm text-danger">종료 페이지가 시작 페이지보다 크거나 같아야 해요.</p>
        )}

        <textarea
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
          placeholder="메모 추가 (선택)"
          rows={2}
          className={`resize-none ${inputClass}`}
        />
      </div>

      {saveError !== "" && <p className="mt-3 text-center text-sm text-danger">{saveError}</p>}

      <motion.button
        type="button"
        whileTap={{ scale: 0.97 }}
        disabled={!formValid || saving}
        onClick={() => void handleSave()}
        className="mt-5 w-full rounded-2xl bg-accent py-4 text-lg font-semibold text-accent-ink disabled:opacity-40"
      >
        {saving ? "저장하는 중…" : "저장"}
      </motion.button>
    </div>
  );
}
