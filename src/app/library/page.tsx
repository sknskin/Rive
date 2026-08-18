"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BookCover from "@/components/BookCover";
import { STATUS_LABELS, STATUS_ORDER } from "@/lib/constants";
import { getRepository } from "@/lib/repository";
import type { Book, BookStatus, UserBook } from "@/lib/types";

interface LibraryItem {
  book: Book;
  userBook: UserBook;
}

// Library — 표지 중심 그리드 + 상태 필터 (스펙 §21, Apple Books 철학)
// Library — cover-centric grid with status filter (spec §21)
export default function LibraryPage() {
  const [status, setStatus] = useState<BookStatus>("reading");
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const repository = getRepository();
      try {
        const userBooks = await repository.listUserBooksByStatus(status);
        const loaded: LibraryItem[] = [];
        for (const userBook of userBooks) {
          const book = await repository.getBook(userBook.bookId);
          if (book) {
            loaded.push({ book, userBook });
          }
        }
        if (!cancelled) {
          setItems(loaded);
          setLoadError("");
          setReady(true);
        }
      } catch (error) {
        console.error("[Library] failed to load:", error);
        if (!cancelled) {
          setLoadError("서재를 불러오지 못했어요.");
          setReady(true);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [status]);

  return (
    <main className="flex-1 px-5 pt-14 pb-36">
      <h1 className="text-2xl font-bold tracking-tight">Library</h1>

      <div className="scrollbar-none -mx-5 mt-4 flex gap-2 overflow-x-auto px-5">
        {STATUS_ORDER.map((candidate) => {
          const active = candidate === status;
          return (
            <button
              key={candidate}
              type="button"
              onClick={() => setStatus(candidate)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-150 ${
                active ? "bg-accent text-accent-ink" : "bg-fill text-ink-secondary"
              }`}
            >
              {STATUS_LABELS[candidate]}
            </button>
          );
        })}
      </div>

      {loadError !== "" && <p className="mt-8 text-sm text-danger">{loadError}</p>}

      {ready && loadError === "" && items.length === 0 && (
        <div className="mt-20 text-center">
          <p className="text-[15px] text-ink-secondary">
            {status === "reading"
              ? "첫 책을 추가해보세요. Today의 READ에서 시작할 수 있어요."
              : `${STATUS_LABELS[status]} 상태의 책이 없어요.`}
          </p>
        </div>
      )}

      <div className="mt-6 grid grid-cols-3 gap-x-4 gap-y-6">
        {items.map(({ book }) => (
          <Link key={book.id} href={`/library/${book.id}`} className="group">
            <div className="transition-transform duration-150 group-active:scale-95">
              <BookCover title={book.title} coverUrl={book.coverUrl} size="fluid" />
            </div>
            <p className="mt-2 line-clamp-2 text-xs leading-snug font-medium break-keep">
              {book.title}
            </p>
          </Link>
        ))}
      </div>
    </main>
  );
}
