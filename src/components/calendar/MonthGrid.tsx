"use client";

import Image from "next/image";
import { formatDurationCompact } from "@/lib/format";
import type { DaySummary } from "@/lib/hooks/useMonthSessions";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const DAYS_PER_WEEK = 7;

interface MonthGridProps {
  year: number;
  month: number;
  days: Map<number, DaySummary>;
  selectedDay: number | null;
  onSelectDay: (day: number) => void;
}

// 월간 그리드 — 셀은 요약만, 상세는 선택 시 (스펙 §17, Apple Calendar 철학)
// Month grid — cells stay minimal; details appear on selection (spec §17)
export default function MonthGrid({
  year,
  month,
  days,
  selectedDay,
  onSelectDay,
}: MonthGridProps) {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
  const todayDay = isCurrentMonth ? today.getDate() : null;

  const cells: Array<number | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  while (cells.length % DAYS_PER_WEEK !== 0) {
    cells.push(null);
  }

  return (
    <div>
      <div className="grid grid-cols-7 text-center">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="pb-2 text-[11px] font-medium text-ink-tertiary">
            {label}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, index) => {
          if (day === null) {
            return <span key={`empty-${index}`} />;
          }

          const summary = days.get(day);
          const isToday = day === todayDay;
          const isSelected = day === selectedDay;
          const isFuture =
            isCurrentMonth && todayDay !== null ? day > todayDay : false;
          const firstCover = summary?.items.find(
            (item) => item.book && item.book.coverUrl !== "",
          )?.book;

          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelectDay(day)}
              className={`flex min-h-16 cursor-pointer flex-col items-center gap-0.5 rounded-xl pt-1 pb-1.5 transition-colors duration-150 md:min-h-20 md:hover:bg-fill/60 ${
                isSelected ? "bg-fill" : ""
              } ${isFuture ? "opacity-40" : ""}`}
            >
              <span
                className={`nums flex size-6 items-center justify-center rounded-full text-[13px] ${
                  isToday ? "bg-accent font-semibold text-accent-ink" : "font-medium"
                }`}
              >
                {day}
              </span>

              {summary && (
                <>
                  {firstCover ? (
                    <span className="relative h-7 w-5 overflow-hidden rounded-[3px] ring-1 ring-separator">
                      <Image
                        src={firstCover.coverUrl}
                        alt=""
                        fill
                        sizes="20px"
                        className="object-cover"
                      />
                    </span>
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-tint" />
                  )}
                  <span className="nums text-[9px] leading-tight font-medium text-ink-secondary">
                    {summary.items.length > 1
                      ? `${summary.items.length}·${formatDurationCompact(summary.totalSeconds)}`
                      : formatDurationCompact(summary.totalSeconds)}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
