"use client";

import { useState } from "react";
import DayDetail from "@/components/calendar/DayDetail";
import MonthGrid from "@/components/calendar/MonthGrid";
import ManualSessionSheet from "@/components/read/ManualSessionSheet";
import { useMonthSessions } from "@/lib/hooks/useMonthSessions";

export default function CalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(now.getDate());
  const [manualOpen, setManualOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const { days, loading, error } = useMonthSessions(year, month, reloadKey);

  function moveMonth(delta: number) {
    const moved = new Date(year, month + delta, 1);
    setYear(moved.getFullYear());
    setMonth(moved.getMonth());
    setSelectedDay(null);
  }

  return (
    <main className="flex-1 px-5 pt-14 pb-36">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">
          {year}년 {month + 1}월
        </h1>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label="이전 달"
            onClick={() => moveMonth(-1)}
            className="flex size-9 items-center justify-center rounded-full text-lg text-tint active:bg-fill"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="다음 달"
            onClick={() => moveMonth(1)}
            className="flex size-9 items-center justify-center rounded-full text-lg text-tint active:bg-fill"
          >
            ›
          </button>
        </div>
      </header>

      {error !== "" && <p className="mt-6 text-sm text-danger">{error}</p>}

      <div
        className={`mt-6 transition-opacity duration-300 ${loading ? "opacity-40" : "opacity-100"}`}
      >
        <MonthGrid
          year={year}
          month={month}
          days={days}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
        />
      </div>

      <div className="mt-6">
        {selectedDay !== null && (
          <DayDetail year={year} month={month} day={selectedDay} summary={days.get(selectedDay)} />
        )}
      </div>

      {selectedDay !== null && (
        <button
          type="button"
          onClick={() => setManualOpen(true)}
          className="mt-4 text-sm font-medium text-tint active:opacity-70"
        >
          + 기록 추가
        </button>
      )}

      <ManualSessionSheet
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        onSaved={() => setReloadKey((key) => key + 1)}
        presetDate={selectedDay !== null ? new Date(year, month, selectedDay) : undefined}
      />
    </main>
  );
}
