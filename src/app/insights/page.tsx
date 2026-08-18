"use client";

import { useEffect, useState } from "react";
import HourBars from "@/components/insights/HourBars";
import WeekdayBars from "@/components/insights/WeekdayBars";
import { READING_SPEED_WINDOW_DAYS } from "@/lib/constants";
import { dayRange, formatDurationShort } from "@/lib/format";
import {
  countFinishedBooks,
  hourHistogram,
  monthStart,
  peakHourWindow,
  readingSpeedPagesPerHour,
  sessionsInRange,
  summarizeRange,
  weekStart,
  weekdayHistogram,
  yearStart,
  type PeakWindow,
  type RangeSummary,
} from "@/lib/insights";
import { getRepository } from "@/lib/repository";
import type { ReadingSession, UserBook } from "@/lib/types";

const MS_PER_DAY = 24 * 3600 * 1000;

interface PeriodCard {
  label: string;
  summary: RangeSummary;
  finishedBooks: number | null;
}

interface InsightsData {
  periods: PeriodCard[];
  speed: number;
  hourHist: number[];
  peak: PeakWindow | null;
  weekdayHist: number[];
  hasAnySession: boolean;
}

function buildInsights(sessions: ReadingSession[], userBooks: UserBook[]): InsightsData {
  const now = new Date();
  const nowMs = now.getTime();
  const today = dayRange(now);
  const weekMs = weekStart(now).getTime();
  const monthMs = monthStart(now).getTime();
  const yearMs = yearStart(now).getTime();

  const periods: PeriodCard[] = [
    {
      label: "오늘",
      summary: summarizeRange(sessions, today.startMs, today.endMs),
      finishedBooks: null,
    },
    {
      label: "이번 주",
      summary: summarizeRange(sessions, weekMs, nowMs + 1),
      finishedBooks: null,
    },
    {
      label: "이번 달",
      summary: summarizeRange(sessions, monthMs, nowMs + 1),
      finishedBooks: countFinishedBooks(userBooks, monthMs, nowMs + 1),
    },
    {
      label: "올해",
      summary: summarizeRange(sessions, yearMs, nowMs + 1),
      finishedBooks: countFinishedBooks(userBooks, yearMs, nowMs + 1),
    },
  ];

  // Reading Speed는 최근 30일 기록 기준, 부족하면 전체 기록으로 계산 (스펙 §34)
  // Reading speed uses the last 30 days, falling back to all sessions (spec §34)
  const recent = sessionsInRange(
    sessions,
    nowMs - READING_SPEED_WINDOW_DAYS * MS_PER_DAY,
    nowMs + 1,
  );
  const speed =
    readingSpeedPagesPerHour(recent) > 0
      ? readingSpeedPagesPerHour(recent)
      : readingSpeedPagesPerHour(sessions);

  const hourHist = hourHistogram(sessions);

  return {
    periods,
    speed,
    hourHist,
    peak: peakHourWindow(hourHist),
    weekdayHist: weekdayHistogram(sessions),
    hasAnySession: sessions.length > 0,
  };
}

function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

// Insights — 숫자 나열이 아니라 의미 있는 Summary 우선 (스펙 §29)
// Insights — meaningful summaries before raw numbers (spec §29)
export default function InsightsPage() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const repository = getRepository();
      try {
        const sessions = await repository.listAllSessions();
        const userBooks = await repository.listUserBooks();
        if (!cancelled) {
          setData(buildInsights(sessions, userBooks));
          setLoadError("");
        }
      } catch (error) {
        console.error("[Insights] failed to load:", error);
        if (!cancelled) {
          setLoadError("통계를 불러오지 못했어요.");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main
      className={`flex-1 px-5 pt-14 pb-36 transition-opacity duration-300 ${
        data || loadError ? "opacity-100" : "opacity-0"
      }`}
    >
      <h1 className="text-2xl font-bold tracking-tight">Insights</h1>

      {loadError !== "" && <p className="mt-6 text-sm text-danger">{loadError}</p>}

      {data && !data.hasAnySession && (
        <p className="mt-16 text-center text-[15px] text-ink-secondary">
          아직 기록이 부족해요. 책을 읽으면 통계가 쌓여요.
        </p>
      )}

      {data && data.hasAnySession && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3">
            {data.periods.map((period) => (
              <div key={period.label} className="rounded-2xl bg-elevated p-4 ring-1 ring-separator">
                <p className="text-xs font-semibold tracking-wide text-ink-tertiary">
                  {period.label}
                </p>
                <p className="nums mt-1.5 text-xl font-semibold tracking-tight">
                  {formatDurationShort(period.summary.totalSeconds)}
                </p>
                <p className="nums mt-1 text-sm text-ink-secondary">
                  {period.summary.totalPages} pages
                </p>
                <p className="nums text-sm text-ink-secondary">
                  {period.summary.readingDays}일 독서
                  {period.finishedBooks !== null &&
                    period.finishedBooks > 0 &&
                    ` · ${period.finishedBooks}권 완독`}
                </p>
              </div>
            ))}
          </div>

          {data.speed > 0 && (
            <section className="mt-8" aria-label="독서 속도">
              <h2 className="text-xs font-semibold tracking-wide text-ink-tertiary uppercase">
                Reading Speed
              </h2>
              <p className="nums mt-2 text-3xl font-semibold tracking-tight">
                {data.speed}
                <span className="ml-1.5 text-base font-normal text-ink-secondary">
                  pages / hour
                </span>
              </p>
              <p className="mt-1 text-sm text-ink-tertiary">
                최근 {READING_SPEED_WINDOW_DAYS}일 기록 기준
              </p>
            </section>
          )}

          {data.peak && (
            <section className="mt-8" aria-label="시간대 분석">
              <h2 className="text-xs font-semibold tracking-wide text-ink-tertiary uppercase">
                Time of Day
              </h2>
              <p className="mt-2 text-[15px] text-ink-secondary">가장 많이 읽는 시간</p>
              <p className="nums text-xl font-semibold tracking-tight">
                {formatHourLabel(data.peak.startHour)} – {formatHourLabel(data.peak.endHour)}
              </p>
              <div className="mt-4">
                <HourBars histogram={data.hourHist} peak={data.peak} />
              </div>
            </section>
          )}

          <section className="mt-8" aria-label="요일 분석">
            <h2 className="text-xs font-semibold tracking-wide text-ink-tertiary uppercase">
              Day of Week
            </h2>
            <div className="mt-4">
              <WeekdayBars histogram={data.weekdayHist} />
            </div>
          </section>
        </>
      )}
    </main>
  );
}
