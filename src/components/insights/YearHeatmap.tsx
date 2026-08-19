"use client";

import { useEffect, useRef } from "react";
import { formatDurationCompact } from "@/lib/format";
import { dayKey, heatLevel } from "@/lib/insights";

const DAYS_PER_WEEK = 7;
const WEEKS_TO_SHOW = 53;
const MS_PER_DAY = 24 * 3600 * 1000;

// 강도 0–4에 대응하는 셀 클래스 — 단일 색상 계열의 순차 팔레트 (스펙 §30)
// Cell classes for intensity 0–4 — single-hue sequential palette (spec §30)
const LEVEL_CLASSES = ["bg-fill", "bg-tint/25", "bg-tint/50", "bg-tint/75", "bg-tint"];

const MONTH_LABEL_INTERVAL_WEEKS = 5;

interface YearHeatmapProps {
  totalsByDay: Map<string, number>;
  nowMs: number;
}

// 최근 1년 독서 히트맵 — 넓은 콘텐츠는 자체 컨테이너에서 가로 스크롤한다
// Rolling-year reading heatmap — wide content scrolls inside its own container
export default function YearHeatmap({ totalsByDay, nowMs }: YearHeatmapProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  // 처음 열면 가장 최근 주(우측 끝)가 보이도록 스크롤한다
  // Scroll to the most recent weeks (right edge) on mount
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller) {
      scroller.scrollLeft = scroller.scrollWidth;
    }
  }, []);

  const today = new Date(nowMs);
  // 이번 주 토요일을 마지막 칸으로 두고 53주를 거슬러 올라간다
  // Anchor on this week's Saturday and walk back 53 weeks
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + (6 - today.getDay()));
  const startMs = end.getTime() - (WEEKS_TO_SHOW * DAYS_PER_WEEK - 1) * MS_PER_DAY;

  const weeks: { ms: number; future: boolean }[][] = [];
  for (let week = 0; week < WEEKS_TO_SHOW; week++) {
    const column: { ms: number; future: boolean }[] = [];
    for (let day = 0; day < DAYS_PER_WEEK; day++) {
      const ms = startMs + (week * DAYS_PER_WEEK + day) * MS_PER_DAY;
      column.push({ ms, future: ms > nowMs });
    }
    weeks.push(column);
  }

  return (
    <div
      ref={scrollerRef}
      tabIndex={0}
      role="region"
      aria-label="최근 1년 독서 히트맵, 좌우로 스크롤할 수 있어요"
      className="-mx-5 overflow-x-auto px-5"
    >
      <div className="inline-flex flex-col gap-1.5">
        <div className="flex gap-[3px]">
          {weeks.map((column, weekIndex) => (
            <div key={weekIndex} className="flex flex-col gap-[3px]">
              {column.map(({ ms, future }) => {
                if (future) {
                  return <span key={ms} className="size-2.5 rounded-[3px]" />;
                }
                const seconds = totalsByDay.get(dayKey(ms)) ?? 0;
                const date = new Date(ms);
                return (
                  <span
                    key={ms}
                    title={`${date.getMonth() + 1}월 ${date.getDate()}일 · ${
                      seconds > 0 ? formatDurationCompact(seconds) : "기록 없음"
                    }`}
                    className={`size-2.5 rounded-[3px] ${LEVEL_CLASSES[heatLevel(seconds)]}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <div className="nums flex text-[10px] text-ink-tertiary">
          {weeks.map((column, weekIndex) => {
            const first = new Date(column[0].ms);
            const showLabel =
              weekIndex % MONTH_LABEL_INTERVAL_WEEKS === 0 && weekIndex < WEEKS_TO_SHOW - 2;
            return (
              <span key={weekIndex} className="w-[13px] shrink-0 overflow-visible whitespace-nowrap">
                {showLabel ? `${first.getMonth() + 1}월` : ""}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
