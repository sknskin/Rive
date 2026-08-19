"use client";

import { useEffect, useState } from "react";
import { formatStopwatch } from "@/lib/format";

const TICK_INTERVAL_MS = 1000;
const MS_PER_SECOND = 1000;

interface StopwatchProps {
  startedAt: number;
  stoppedAt: number | null;
}

// 스톱워치 — 화면의 Hero Element (스펙 §0-7, §8)
// Stopwatch — the hero element of the screen (spec §0-7, §8)
export default function Stopwatch({ startedAt, stoppedAt }: StopwatchProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (stoppedAt !== null) {
      return;
    }

    // interval 누적 오차 대신 매 tick마다 현재 시각 기준으로 재계산한다
    // Recompute from the wall clock each tick to avoid interval drift
    const timer = setInterval(() => setNowMs(Date.now()), TICK_INTERVAL_MS);

    const handleVisibility = () => setNowMs(Date.now());
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [stoppedAt]);

  const referenceMs = stoppedAt ?? nowMs;
  const elapsedSeconds = Math.max(0, (referenceMs - startedAt) / MS_PER_SECOND);

  return (
    <p className="nums text-[64px] leading-none font-extralight tracking-tight md:text-[84px]">
      {formatStopwatch(elapsedSeconds)}
    </p>
  );
}
