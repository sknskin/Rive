"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import BottomSheet from "@/components/BottomSheet";
import { formatShortDate } from "@/lib/format";
import { getRepository } from "@/lib/repository";
import type { BookNote, BookQuote } from "@/lib/types";

// 노트/인용구 관리 — Book Detail 안에서만 다룬다 (스펙 §27)
// Notes/quotes management — lives inside Book Detail (spec §27)
interface NotesQuotesProps {
  bookId: string;
}

type EntryKind = "note" | "quote";

export default function NotesQuotes({ bookId }: NotesQuotesProps) {
  const [notes, setNotes] = useState<BookNote[]>([]);
  const [quotes, setQuotes] = useState<BookQuote[]>([]);
  const [loadError, setLoadError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: EntryKind; id: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const repository = getRepository();
        const [loadedNotes, loadedQuotes] = await Promise.all([
          repository.listNotesForBook(bookId),
          repository.listQuotesForBook(bookId),
        ]);
        if (!cancelled) {
          setNotes(loadedNotes);
          setQuotes(loadedQuotes);
          setLoadError("");
        }
      } catch (error) {
        console.error("[NotesQuotes] failed to load:", error);
        if (!cancelled) {
          setLoadError("노트를 불러오지 못했어요.");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [bookId, reloadKey]);

  async function handleDelete() {
    if (!deleteTarget) {
      return;
    }
    try {
      const repository = getRepository();
      if (deleteTarget.kind === "note") {
        await repository.deleteNote(deleteTarget.id);
      } else {
        await repository.deleteQuote(deleteTarget.id);
      }
      setDeleteTarget(null);
      setReloadKey((key) => key + 1);
    } catch (error) {
      console.error("[NotesQuotes] failed to delete:", error);
      setLoadError("삭제하지 못했어요. 다시 시도해 주세요.");
      setDeleteTarget(null);
    }
  }

  const isEmpty = notes.length === 0 && quotes.length === 0;

  return (
    <section className="mt-8" aria-label="노트와 인용구">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs font-semibold tracking-wide text-ink-tertiary uppercase">
          Notes & Quotes
        </h2>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="cursor-pointer text-sm font-medium text-tint active:opacity-70"
        >
          + 남기기
        </button>
      </div>

      {loadError !== "" && <p className="mt-2 text-sm text-danger">{loadError}</p>}

      {isEmpty && loadError === "" ? (
        <p className="mt-3 text-sm leading-relaxed text-ink-tertiary">
          기억하고 싶은 문장이나 생각을 남겨보세요
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2.5">
          {quotes.map((quote) => (
            <li key={quote.id} className="rounded-xl bg-fill/60 px-4 py-3">
              <p className="text-[15px] leading-relaxed break-keep">“{quote.quote}”</p>
              {quote.comment !== "" && (
                <p className="mt-1.5 text-sm break-keep text-ink-secondary">{quote.comment}</p>
              )}
              <div className="nums mt-2 flex items-baseline justify-between text-xs text-ink-tertiary">
                <span>
                  p.{quote.page} · {formatShortDate(quote.createdAt)}
                </span>
                <button
                  type="button"
                  onClick={() => setDeleteTarget({ kind: "quote", id: quote.id })}
                  className="cursor-pointer font-medium active:opacity-70"
                >
                  삭제
                </button>
              </div>
            </li>
          ))}
          {notes.map((note) => (
            <li key={note.id} className="border-l-2 border-separator px-3.5 py-1">
              <p className="text-[15px] leading-relaxed break-keep text-ink-secondary">
                {note.content}
              </p>
              <div className="nums mt-1.5 flex items-baseline justify-between text-xs text-ink-tertiary">
                <span>{formatShortDate(note.createdAt)}</span>
                <button
                  type="button"
                  onClick={() => setDeleteTarget({ kind: "note", id: note.id })}
                  className="cursor-pointer font-medium active:opacity-70"
                >
                  삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <BottomSheet open={addOpen} onClose={() => setAddOpen(false)}>
        <AddEntryForm
          bookId={bookId}
          onSaved={() => {
            setAddOpen(false);
            setReloadKey((key) => key + 1);
          }}
        />
      </BottomSheet>

      <BottomSheet open={deleteTarget !== null} onClose={() => setDeleteTarget(null)}>
        <div className="px-2 pt-2 text-center">
          <h2 className="text-lg font-semibold tracking-tight">
            이 {deleteTarget?.kind === "quote" ? "인용구" : "노트"}를 삭제할까요?
          </h2>
          <div className="mt-6 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => void handleDelete()}
              className="w-full cursor-pointer rounded-2xl bg-fill py-3.5 text-[15px] font-semibold text-danger"
            >
              삭제하기
            </button>
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="w-full cursor-pointer py-2 text-sm font-medium text-ink-tertiary"
            >
              취소
            </button>
          </div>
        </div>
      </BottomSheet>
    </section>
  );
}

function AddEntryForm({ bookId, onSaved }: { bookId: string; onSaved: () => void }) {
  const [kind, setKind] = useState<EntryKind>("quote");
  const [text, setText] = useState("");
  const [pageText, setPageText] = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const page = Number.parseInt(pageText, 10);
  const valid =
    text.trim() !== "" && (kind === "note" || (Number.isFinite(page) && page > 0));

  async function handleSave() {
    if (!valid) {
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const repository = getRepository();
      if (kind === "note") {
        await repository.addNote({ bookId, content: text.trim() });
      } else {
        await repository.addQuote({
          bookId,
          page,
          quote: text.trim(),
          comment: comment.trim(),
        });
      }
      onSaved();
    } catch (error) {
      console.error("[NotesQuotes] failed to save:", error);
      setSaveError("저장하지 못했어요. 다시 시도해 주세요.");
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-xl bg-fill px-3.5 py-3 text-[15px] outline-none placeholder:text-ink-tertiary focus:ring-2 focus:ring-tint";

  return (
    <div className="px-2">
      <div className="flex gap-2">
        {(
          [
            { value: "quote", label: "인용구" },
            { value: "note", label: "노트" },
          ] as const
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setKind(option.value)}
            className={`cursor-pointer rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors duration-150 ${
              kind === option.value ? "bg-accent text-accent-ink" : "bg-fill text-ink-secondary"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={kind === "quote" ? "인상 깊었던 문장" : "자유롭게 생각을 남겨보세요"}
          rows={3}
          autoFocus
          className={`resize-none ${inputClass}`}
        />
        {kind === "quote" && (
          <>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={pageText}
              onChange={(event) => setPageText(event.target.value)}
              placeholder="페이지"
              className={`nums ${inputClass}`}
            />
            <input
              type="text"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="코멘트 (선택)"
              className={inputClass}
            />
          </>
        )}
      </div>

      {saveError !== "" && <p className="mt-3 text-center text-sm text-danger">{saveError}</p>}

      <motion.button
        type="button"
        whileTap={{ scale: 0.97 }}
        disabled={!valid || saving}
        onClick={() => void handleSave()}
        className="mt-5 w-full cursor-pointer rounded-2xl bg-accent py-3.5 text-[15px] font-semibold text-accent-ink disabled:opacity-40"
      >
        {saving ? "저장하는 중…" : "저장"}
      </motion.button>
    </div>
  );
}
