"use client";

import { useEffect, useState } from "react";
import HourBars from "@/components/insights/HourBars";
import WeekdayBars from "@/components/insights/WeekdayBars";
import YearHeatmap from "@/components/insights/YearHeatmap";
import { READING_SPEED_WINDOW_DAYS } from "@/lib/constants";
import { dayRange, formatDurationCompact, formatDurationShort } from "@/lib/format";
import {
  countFinishedBooks,
  dailyTotals,
  genreDistribution,
  hourHistogram,
  monthStart,
  peakHourWindow,
  readingSpeedPagesPerHour,
  sessionsInRange,
  summarizeRange,
  weekStart,
  weekdayHistogram,
  yearStart,
  type GenreSeconds,
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
  genres: GenreSeconds[];
  heatTotals: Map<string, number>;
  nowMs: number;
  hasAnySession: boolean;
}

function buildInsights(
  sessions: ReadingSession[],
  userBooks: UserBook[],
  categoriesByBookId: Map<string, string[]>,
): InsightsData {
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
    genres: genreDistribution(sessions, categoriesByBookId),
    heatTotals: dailyTotals(sessions),
    nowMs,
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

        // 장르 분포용 — 세션에 등장한 책의 카테고리를 모은다
        // For genre distribution — gather categories of books that have sessions
        const categoriesByBookId = new Map<string, string[]>();
        const uniqueBookIds = [...new Set(sessions.map((session) => session.bookId))];
        for (const bookId of uniqueBookIds) {
          const book = await repository.getBook(bookId);
          if (book?.categories && book.categories.length > 0) {
            categoriesByBookId.set(bookId, book.categories);
          }
        }

        if (!cancelled) {
          setData(buildInsights(sessions, userBooks, categoriesByBookId));
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
      className={`flex-1 px-5 pt-8 pb-20 transition-opacity duration-300 ${
        data || loadError ? "opacity-100" : "opacity-0"
      }`}
    >
      <h1 className="text-2xl font-bold tracking-tight">Insights</h1>

      {loadError !== "" && <p className="mt-6 text-sm text-danger">{loadError}</p>}

      {data && !data.hasAnySession && (
        <div className="mt-24 text-center">
          <p className="text-[17px] font-semibold tracking-tight">
            아직 보여드릴 통계가 없어요
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-secondary">
            책을 읽기 시작하면
            <br />
            이 공간이 조금씩 채워질 거예요
          </p>
        </div>
      )}

      {data && data.hasAnySession && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
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

          {/* 데스크톱: 좌측 속도·시간대·요일 / 우측 히트맵·장르 2단 배치 */}
          {/* Desktop: two columns — speed/time/weekday left, heatmap/genres right */}
          <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-14">
          <div>
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
          </div>

          <div>
          <section className="mt-8" aria-label="연간 독서 활동">
            <h2 className="text-xs font-semibold tracking-wide text-ink-tertiary uppercase">
              Activity
            </h2>
            <div className="mt-4">
              <YearHeatmap totalsByDay={data.heatTotals} nowMs={data.nowMs} />
            </div>
          </section>

          {data.genres.length > 0 && (
            <section className="mt-8" aria-label="장르 분석">
              <h2 className="text-xs font-semibold tracking-wide text-ink-tertiary uppercase">
                Genres
              </h2>
              <div className="mt-4 flex flex-col gap-2.5">
                {data.genres.map((genre) => {
                  const max = data.genres[0]?.totalSeconds ?? 1;
                  return (
                    <div key={genre.name} className="flex items-center gap-3">
                      <span className="w-24 shrink-0 truncate text-[13px] font-medium md:w-32">
                        {genre.name}
                      </span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-fill">
                        <div
                          className="h-full rounded-full bg-tint transition-[width] duration-500"
                          style={{ width: `${Math.round((genre.totalSeconds / max) * 100)}%` }}
                        />
                      </div>
                      <span className="nums w-12 shrink-0 text-right text-[13px] text-ink-secondary">
                        {formatDurationCompact(genre.totalSeconds)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
          </div>
          </div>
        </>
      )}
    </main>
  );
}
