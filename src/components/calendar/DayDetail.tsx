"use client";

import { motion } from "motion/react";
import BookCover from "@/components/BookCover";
import {
  formatDurationShort,
  formatPageRange,
  formatTimeOfDay,
} from "@/lib/format";
import type { DaySummary } from "@/lib/hooks/useMonthSessions";

const WEEKDAY_FULL_LABELS = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

interface DayDetailProps {
  year: number;
  month: number;
  day: number;
  summary: DaySummary | undefined;
}

// 날짜 선택 시 세션 상세 — 시간순 나열 (스펙 §18)
// Day detail on selection — sessions in chronological order (spec §18)
export default function DayDetail({ year, month, day, summary }: DayDetailProps) {
  const date = new Date(year, month, day);
  const heading = `${month + 1}월 ${day}일 ${WEEKDAY_FULL_LABELS[date.getDay()]}`;

  return (
    <motion.section
      key={`${year}-${month}-${day}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      aria-label="선택한 날짜의 독서 기록"
      className="border-t border-separator pt-4"
    >
      <h2 className="text-[15px] font-semibold tracking-tight">{heading}</h2>

      {!summary || summary.items.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-tertiary">이날은 기록이 없어요.</p>
      ) : (
        <ul className="mt-1 divide-y divide-separator">
          {summary.items.map(({ session, book }) => (
            <li key={session.id} className="flex gap-3.5 py-3.5">
              <BookCover title={book?.title ?? "책"} coverUrl={book?.coverUrl ?? ""} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium">{book?.title ?? "알 수 없는 책"}</p>
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
              </div>
            </li>
          ))}
        </ul>
      )}
    </motion.section>
  );
}
