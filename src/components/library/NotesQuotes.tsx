"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import BottomSheet from "@/components/BottomSheet";
import { formatShortDate } from "@/lib/format";
import { getRepository } from "@/lib/repository";
import { getAuthHeader, isServerMode } from "@/lib/supabase/client";
import type { BookNote, BookQuote } from "@/lib/types";

// 인용구 사진 OCR — 업로드 전 리사이즈로 전송량과 서버 상한을 함께 지킨다 (리서치 2차)
// Quote-photo OCR — client-side resize keeps payloads within the server cap
const OCR_MAX_DIMENSION = 1024;
const OCR_JPEG_QUALITY = 0.8;

// 파일 → 압축 JPEG base64 (data: 접두어 제외)
// File → compressed JPEG base64 without the data: prefix
async function compressImageToBase64(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, OCR_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("canvas context unavailable");
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", OCR_JPEG_QUALITY).split(",")[1];
}

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
  const [deleting, setDeleting] = useState(false);
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

  // 삭제 진행 중 중복 실행 방지 — 저장 경로의 saving 가드와 대칭 (6차 조사 D1)
  // Prevent duplicate deletes in flight — mirrors the save path's saving guard (audit 6 D1)
  async function handleDelete() {
    if (!deleteTarget || deleting) {
      return;
    }
    setDeleting(true);
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
    } finally {
      setDeleting(false);
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

      <BottomSheet open={addOpen} onClose={() => setAddOpen(false)} label="노트 추가">
        <AddEntryForm
          bookId={bookId}
          onSaved={() => {
            setAddOpen(false);
            setReloadKey((key) => key + 1);
          }}
        />
      </BottomSheet>

      <BottomSheet
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        label="삭제 확인"
      >
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
  const [ocrBusy, setOcrBusy] = useState(false);
  const ocrInputRef = useRef<HTMLInputElement>(null);

  // 사진에서 문장 추출 — 로그인(서버 모드) 사용자만, Gemini 비전 사용 (리서치 2차)
  // Extract text from a photo — signed-in users only, powered by Gemini vision
  async function handleOcrFile(file: File) {
    setOcrBusy(true);
    setSaveError("");
    try {
      const imageBase64 = await compressImageToBase64(file);
      const response = await fetch("/api/ai/quote-ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeader()) },
        body: JSON.stringify({ imageBase64, mimeType: "image/jpeg" }),
      });
      const body = (await response.json()) as { text?: string; error?: string };
      if (!response.ok) {
        setSaveError(body.error ?? "사진에서 글자를 읽지 못했어요.");
        return;
      }
      if (!body.text) {
        setSaveError("사진에서 글자를 찾지 못했어요. 더 선명한 사진으로 시도해 주세요.");
        return;
      }
      setText(body.text);
    } catch (error) {
      console.error("[NotesQuotes] ocr failed:", error);
      setSaveError("사진을 처리하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setOcrBusy(false);
    }
  }

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
            aria-pressed={kind === option.value}
            onClick={() => setKind(option.value)}
            className={`cursor-pointer rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors duration-150 ${
              kind === option.value ? "bg-accent text-accent-ink" : "bg-fill text-ink-secondary"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* 사진 OCR — 인용구 모드 + 로그인 상태에서만 (AI 라우트가 인증 필수) */}
      {/* Photo OCR — quote mode and signed-in only (the AI route requires auth) */}
      {kind === "quote" && isServerMode() && (
        <>
          <button
            type="button"
            disabled={ocrBusy || saving}
            onClick={() => ocrInputRef.current?.click()}
            className="mt-3 w-full cursor-pointer rounded-xl bg-fill py-2.5 text-[13px] font-medium text-tint active:opacity-70 disabled:opacity-40"
          >
            {ocrBusy ? "사진에서 읽는 중…" : "책 사진에서 문장 가져오기"}
          </button>
          <input
            ref={ocrInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void handleOcrFile(file);
              }
              event.target.value = "";
            }}
          />
        </>
      )}

      <div className="mt-4 flex flex-col gap-3">
        <textarea
          value={text}
          aria-label={kind === "quote" ? "인용구 내용" : "노트 내용"}
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
              aria-label="페이지"
              onChange={(event) => setPageText(event.target.value)}
              placeholder="페이지"
              className={`nums ${inputClass}`}
            />
            <input
              type="text"
              value={comment}
              aria-label="코멘트"
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
