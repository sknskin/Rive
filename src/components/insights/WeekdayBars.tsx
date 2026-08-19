"use client";

import { formatDurationCompact } from "@/lib/format";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

interface WeekdayBarsProps {
  histogram: number[];
}

// 요일 분석 차트 — 단일 시리즈, 최대 요일만 직접 라벨 (스펙 §32)
// Weekday chart — single series with a direct label on the top day only (spec §32)
export default function WeekdayBars({ histogram }: WeekdayBarsProps) {
  const max = Math.max(...histogram, 1);
  const topIndex = histogram.indexOf(Math.max(...histogram));
  const hasData = histogram.some((seconds) => seconds > 0);

  // 전부 0이면 더미 막대 대신 빈 상태 문구를 보여준다 (5차 조사 L6)
  // All-zero data shows an empty-state message instead of dummy bars (audit 5 L6)
  if (!hasData) {
    return (
      <p className="py-6 text-center text-sm text-ink-tertiary">
        아직 요일 데이터가 없어요
      </p>
    );
  }

  return (
    <div
      role="img"
      aria-label={`요일별 독서 분포, 가장 많이 읽은 요일은 ${WEEKDAY_LABELS[topIndex]}요일`}
      className="flex h-28 items-end gap-2.5"
    >
      {histogram.map((seconds, weekday) => {
        const heightPercent = (seconds / max) * 100;
        const isTop = hasData && weekday === topIndex;
        return (
          <div
            key={weekday}
            title={`${WEEKDAY_LABELS[weekday]} · ${formatDurationCompact(seconds)}`}
            className="flex h-full flex-1 flex-col items-center justify-end gap-1"
          >
            {isTop && (
              <span className="nums text-[10px] font-medium text-ink-secondary">
                {formatDurationCompact(seconds)}
              </span>
            )}
            <div
              className={`w-full rounded-t-[4px] ${
                seconds === 0 ? "bg-fill" : isTop ? "bg-tint" : "bg-tint/30"
              }`}
              style={{ height: seconds === 0 ? "3px" : `${Math.max(heightPercent, 6)}%` }}
            />
            <span
              className={`text-[11px] ${
                isTop ? "font-semibold text-ink" : "font-medium text-ink-tertiary"
              }`}
            >
              {WEEKDAY_LABELS[weekday]}
            </span>
          </div>
        );
      })}
    </div>
  );
}
