"use client";

import { formatDurationCompact } from "@/lib/format";
import type { PeakWindow } from "@/lib/insights";

const HOUR_TICKS = [0, 6, 12, 18];
const HOURS_PER_DAY = 24;

interface HourBarsProps {
  histogram: number[];
  peak: PeakWindow | null;
}

// 시간대 분석 차트 — 단일 시리즈, peak 구간만 진하게 강조 (스펙 §31)
// Time-of-day chart — single series with the peak window emphasized (spec §31)
export default function HourBars({ histogram, peak }: HourBarsProps) {
  const max = Math.max(...histogram, 1);
  const hasData = histogram.some((seconds) => seconds > 0);

  // 전부 0이면 더미 막대 대신 빈 상태 문구를 보여준다 (5차 조사 L6)
  // All-zero data shows an empty-state message instead of dummy bars (audit 5 L6)
  if (!hasData) {
    return (
      <p className="py-6 text-center text-sm text-ink-tertiary">
        아직 시간대 데이터가 없어요
      </p>
    );
  }

  function isInPeak(hour: number): boolean {
    if (!peak) {
      return false;
    }
    // 자정을 넘기는 구간도 포함 여부를 판정한다
    // Handle windows that wrap past midnight
    if (peak.startHour < peak.endHour) {
      return hour >= peak.startHour && hour < peak.endHour;
    }
    return hour >= peak.startHour || hour < peak.endHour;
  }

  return (
    <div
      role="img"
      aria-label={`시간대별 독서 분포${
        peak ? `, 집중 시간대 ${peak.startHour}시부터 ${peak.endHour}시까지` : ""
      }`}
    >
      <div className="flex h-20 items-end gap-[3px]">
        {histogram.map((seconds, hour) => {
          const heightPercent = (seconds / max) * 100;
          return (
            <div
              key={hour}
              title={`${String(hour).padStart(2, "0")}:00 · ${formatDurationCompact(seconds)}`}
              className="relative flex-1"
              style={{ height: "100%" }}
            >
              <div
                className={`absolute inset-x-0 bottom-0 rounded-t-[3px] ${
                  seconds === 0 ? "bg-fill" : isInPeak(hour) ? "bg-tint" : "bg-tint/30"
                }`}
                style={{ height: seconds === 0 ? "3px" : `${Math.max(heightPercent, 6)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="nums relative mt-1.5 h-4 text-[10px] text-ink-tertiary">
        {HOUR_TICKS.map((tick) => (
          <span
            key={tick}
            className="absolute"
            style={{ left: `${(tick / HOURS_PER_DAY) * 100}%` }}
          >
            {tick}시
          </span>
        ))}
      </div>
    </div>
  );
}
