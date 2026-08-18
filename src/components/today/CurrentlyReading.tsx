import BookCover from "@/components/BookCover";
import type { Book, UserBook } from "@/lib/types";

interface CurrentlyReadingProps {
  book: Book;
  userBook: UserBook;
}

// 현재 읽는 책 — 표지가 핵심 시각 요소 (스펙 §3, §0-2 Content First)
// Currently reading — the cover is the primary visual element (spec §3, §0-2)
export default function CurrentlyReading({ book, userBook }: CurrentlyReadingProps) {
  const hasProgress = book.pageCount > 0 && userBook.currentPage > 0;
  const progressPercent = hasProgress
    ? Math.min(100, Math.round((userBook.currentPage / book.pageCount) * 100))
    : 0;

  return (
    <section aria-label="현재 읽는 책">
      <h2 className="text-xs font-semibold tracking-wide text-ink-tertiary uppercase">
        Currently Reading
      </h2>
      <div className="mt-3 flex items-center gap-5">
        <BookCover title={book.title} coverUrl={book.coverUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-xl leading-snug font-semibold tracking-tight break-keep">
            {book.title}
          </p>
          {book.authors.length > 0 && (
            <p className="mt-1 text-[15px] text-ink-secondary">{book.authors.join(", ")}</p>
          )}
          {userBook.currentPage > 0 && (
            <p className="nums mt-3 text-sm text-ink-secondary">
              p.{userBook.currentPage}
              {book.pageCount > 0 && ` / ${book.pageCount}`}
            </p>
          )}
          {hasProgress && (
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-fill">
              <div
                className="h-full rounded-full bg-ink transition-[width] duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
