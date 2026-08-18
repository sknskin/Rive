import { formatDurationShort, formatPageRange, formatTimeOfDay } from "@/lib/format";
import type { ReadingSession } from "@/lib/types";

export interface SessionRow {
  session: ReadingSession;
  bookTitle: string;
}

interface TodaySessionsProps {
  rows: SessionRow[];
}

// 오늘의 독서 기록 — 여러 세션과 합계를 함께 보여준다 (스펙 §16)
// Today's reading — shows every session plus the daily summary (spec §16)
export default function TodaySessions({ rows }: TodaySessionsProps) {
  const totalSeconds = rows.reduce((sum, row) => sum + row.session.durationSeconds, 0);
  const totalPages = rows.reduce((sum, row) => sum + row.session.pagesRead, 0);
  const bookCount = new Set(rows.map((row) => row.session.bookId)).size;

  return (
    <section aria-label="오늘의 독서 기록">
      <h2 className="text-xs font-semibold tracking-wide text-ink-tertiary uppercase">Today</h2>

      <ul className="mt-2 divide-y divide-separator">
        {rows.map(({ session, bookTitle }) => (
          <li key={session.id} className="py-3.5">
            <p className="text-[15px] font-medium">{bookTitle}</p>
            <div className="nums mt-1 flex items-baseline justify-between text-sm text-ink-secondary">
              <span>
                {formatTimeOfDay(session.startedAt)} – {formatTimeOfDay(session.endedAt)}
              </span>
              <span className="font-medium text-ink">
                {formatDurationShort(session.durationSeconds)}
              </span>
            </div>
            <div className="nums mt-0.5 flex items-baseline justify-between text-sm text-ink-secondary">
              <span>{formatPageRange(session.startPage, session.endPage)}</span>
              <span>{session.pagesRead} pages</span>
            </div>
            {session.memo !== "" && (
              <p className="mt-1.5 text-sm break-keep text-ink-secondary">{session.memo}</p>
            )}
          </li>
        ))}
      </ul>

      <div className="nums mt-1 flex gap-4 border-t border-separator pt-3 text-sm text-ink-secondary">
        <span className="font-semibold text-ink">{formatDurationShort(totalSeconds)}</span>
        <span>{totalPages} pages</span>
        <span>{bookCount}권</span>
      </div>
    </section>
  );
}
