"use client";

import { useEffect, useState } from "react";
import HourBars from "@/components/insights/HourBars";
import WeekdayBars from "@/components/insights/WeekdayBars";
import WrappedSheet from "@/components/insights/WrappedSheet";
import YearHeatmap from "@/components/insights/YearHeatmap";
import { computeWrappedStats, type WrappedScope, type WrappedStats } from "@/lib/wrapped";
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
import type { ReadingGoals, ReadingSession, UserBook } from "@/lib/types";
import BottomSheet from "@/components/BottomSheet";
import { motion } from "motion/react";

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
  const [goals, setGoals] = useState<ReadingGoals | null>(null);
  const [goalsSheetOpen, setGoalsSheetOpen] = useState(false);
  const [wrappedStats, setWrappedStats] = useState<WrappedStats | null>(null);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  // 리캡 열기 — 클릭 시점 데이터로 통계를 계산한다
  // Open wrapped — stats computed from data at click time
  async function openWrapped(scope: WrappedScope) {
    try {
      const repository = getRepository();
      // 독립 조회는 병렬로, 책은 배치로 — N+1 방지 (6차 조사 D3·D4)
      // Parallel independent reads and batched books — avoids N+1 (audit 6 D3, D4)
      const [sessions, userBooks] = await Promise.all([
        repository.listAllSessions(),
        repository.listUserBooks(),
      ]);
      const booksById = await repository.listBooksByIds(
        sessions.map((session) => session.bookId),
      );
      setWrappedStats(computeWrappedStats(scope, new Date(), sessions, userBooks, booksById));
    } catch (error) {
      console.error("[Insights] failed to open wrapped:", error);
      setLoadError("리캡을 준비하지 못했어요.");
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const repository = getRepository();
      try {
        // 서로 독립적인 조회는 병렬로 실행한다 (6차 조사 D4)
        // Run independent reads in parallel (audit 6 D4)
        const [sessions, userBooks, loadedGoals] = await Promise.all([
          repository.listAllSessions(),
          repository.listUserBooks(),
          repository.getGoals(),
        ]);

        // 지난해에 세운 목표는 만료로 취급한다 — 새해에는 목표를 다시 세우도록 유도 (연도 롤오버)
        // Goals saved for a past year are treated as expired so a new year starts fresh (year rollover)
        const currentYear = new Date().getFullYear();
        const activeGoals =
          loadedGoals && loadedGoals.year === currentYear ? loadedGoals : null;

        // 장르 분포용 — 세션에 등장한 책의 카테고리를 배치 조회로 모은다
        // For genre distribution — gather session books' categories via batch lookup
        const sessionBooks = await repository.listBooksByIds(
          sessions.map((session) => session.bookId),
        );
        const categoriesByBookId = new Map<string, string[]>();
        for (const book of sessionBooks.values()) {
          if (book.categories && book.categories.length > 0) {
            categoriesByBookId.set(book.id, book.categories);
          }
        }

        if (!cancelled) {
          setData(buildInsights(sessions, userBooks, categoriesByBookId));
          setGoals(activeGoals);
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
  }, [reloadKey]);

  return (
    <main
      className={`flex-1 px-5 pt-8 pb-20 transition-opacity duration-300 ${
        data || loadError ? "opacity-100" : "opacity-0"
      }`}
    >
      <h1 className="text-2xl font-bold tracking-tight">Insights</h1>

      {loadError !== "" && <p className="mt-6 text-sm text-danger">{loadError}</p>}

      {/* 목표는 기록이 없어도 세울 수 있어야 한다 — 빈 상태와 무관하게 표시 */}
      {/* Goals must be reachable even with zero sessions — shown regardless of empty state */}
      {data && (
        <section className="mt-6" aria-label="독서 목표">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xs font-semibold tracking-wide text-ink-tertiary uppercase">
              Goals {new Date(data.nowMs).getFullYear()}
            </h2>
            <button
              type="button"
              onClick={() => setGoalsSheetOpen(true)}
              className="cursor-pointer text-sm font-medium text-tint active:opacity-70"
            >
              {goals ? "목표 수정" : "올해 목표 세우기"}
            </button>
          </div>
          {goals && (goals.targetBooks > 0 || goals.targetPages > 0 || goals.targetHours > 0) && (
            <div className="mt-3 flex flex-col gap-3">
              {goals.targetBooks > 0 && (
                <GoalBar
                  label="완독"
                  current={data.periods[3].finishedBooks ?? 0}
                  target={goals.targetBooks}
                  unit="권"
                />
              )}
              {goals.targetPages > 0 && (
                <GoalBar
                  label="페이지"
                  current={data.periods[3].summary.totalPages}
                  target={goals.targetPages}
                  unit="쪽"
                />
              )}
              {goals.targetHours > 0 && (
                <GoalBar
                  label="시간"
                  current={Math.floor(data.periods[3].summary.totalSeconds / 3600)}
                  target={goals.targetHours}
                  unit="시간"
                />
              )}
            </div>
          )}
        </section>
      )}

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
          <section className="mt-6" aria-label="리캡">
            <div className="flex items-baseline justify-between">
              <h2 className="text-xs font-semibold tracking-wide text-ink-tertiary uppercase">
                Wrapped
              </h2>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => void openWrapped("month")}
                  className="cursor-pointer text-sm font-medium text-tint active:opacity-70"
                >
                  이번 달
                </button>
                <button
                  type="button"
                  onClick={() => void openWrapped("year")}
                  className="cursor-pointer text-sm font-medium text-tint active:opacity-70"
                >
                  올해
                </button>
              </div>
            </div>
          </section>

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
                  {period.summary.readingDays}일 독서 · 기록 {period.summary.sessionCount}회
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

      <WrappedSheet
        open={wrappedStats !== null}
        onClose={() => setWrappedStats(null)}
        stats={wrappedStats}
      />

      <BottomSheet
        open={goalsSheetOpen}
        onClose={() => setGoalsSheetOpen(false)}
        label="독서 목표 설정"
      >
        <GoalsForm
          existing={goals}
          onSaved={() => {
            setGoalsSheetOpen(false);
            setReloadKey((key) => key + 1);
          }}
        />
      </BottomSheet>
    </main>
  );
}

// 목표 진행 바 — 압박 없이 담백하게 (스펙 §36, §86)
// Goal progress bar — calm, no pressure (spec §36, §86)
function GoalBar({
  label,
  current,
  target,
  unit,
}: {
  label: string;
  current: number;
  target: number;
  unit: string;
}) {
  const percent = Math.min(100, Math.round((current / target) * 100));
  return (
    <div>
      <div className="nums flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-ink-secondary">
          {current.toLocaleString()} / {target.toLocaleString()}
          {unit}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${label} 목표 진행률`}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-fill"
      >
        <div
          className="h-full rounded-full bg-tint transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function GoalsForm({
  existing,
  onSaved,
}: {
  existing: ReadingGoals | null;
  onSaved: () => void;
}) {
  const [booksText, setBooksText] = useState(
    existing && existing.targetBooks > 0 ? String(existing.targetBooks) : "",
  );
  const [pagesText, setPagesText] = useState(
    existing && existing.targetPages > 0 ? String(existing.targetPages) : "",
  );
  const [hoursText, setHoursText] = useState(
    existing && existing.targetHours > 0 ? String(existing.targetHours) : "",
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  function parseTarget(text: string): number {
    const value = Number.parseInt(text, 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  async function handleSave() {
    setSaving(true);
    setSaveError("");
    try {
      await getRepository().saveGoals({
        year: new Date().getFullYear(),
        targetBooks: parseTarget(booksText),
        targetPages: parseTarget(pagesText),
        targetHours: parseTarget(hoursText),
        updatedAt: Date.now(),
      });
      onSaved();
    } catch (error) {
      console.error("[Goals] failed to save:", error);
      setSaveError("목표를 저장하지 못했어요. 다시 시도해 주세요.");
      setSaving(false);
    }
  }

  const inputClass =
    "nums w-full rounded-xl bg-fill px-3.5 py-3 text-[15px] outline-none placeholder:text-ink-tertiary focus:ring-2 focus:ring-tint";

  return (
    <div className="px-2 pt-2">
      <h2 className="px-1 text-lg font-semibold tracking-tight">올해의 독서 목표</h2>
      <p className="mt-1 px-1 text-sm text-ink-secondary">
        원하는 항목만 채워도 돼요
      </p>
      <div className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-secondary">
          완독할 책 (권)
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={booksText}
            onChange={(event) => setBooksText(event.target.value)}
            placeholder="예: 24"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-secondary">
          읽을 페이지 (쪽)
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={pagesText}
            onChange={(event) => setPagesText(event.target.value)}
            placeholder="예: 6000"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-secondary">
          독서 시간 (시간)
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={hoursText}
            onChange={(event) => setHoursText(event.target.value)}
            placeholder="예: 100"
            className={inputClass}
          />
        </label>
      </div>

      {saveError !== "" && <p className="mt-3 text-center text-sm text-danger">{saveError}</p>}

      <motion.button
        type="button"
        whileTap={{ scale: 0.97 }}
        disabled={saving}
        onClick={() => void handleSave()}
        className="mt-5 w-full cursor-pointer rounded-2xl bg-accent py-3.5 text-[15px] font-semibold text-accent-ink disabled:opacity-40"
      >
        {saving ? "저장하는 중…" : "저장"}
      </motion.button>
    </div>
  );
}
