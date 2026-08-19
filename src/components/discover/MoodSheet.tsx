"use client";

import { useState } from "react";
import { motion } from "motion/react";
import BottomSheet from "@/components/BottomSheet";
import { MOOD_OPTIONS, TIME_OPTIONS } from "@/lib/constants";

interface MoodSheetProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (options: { mood?: string; timeAvailable?: string }) => void;
}

// 기분/시간 맞춤 추천 — 선택은 모두 선택 사항 (스펙 §53–54)
// Mood/time-tailored recommendation — every choice is optional (spec §53–54)
export default function MoodSheet({ open, onClose, onSubmit }: MoodSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose}>
      <MoodContent onSubmit={onSubmit} />
    </BottomSheet>
  );
}

function MoodContent({ onSubmit }: Pick<MoodSheetProps, "onSubmit">) {
  const [mood, setMood] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);

  function chipClass(selected: boolean): string {
    return `cursor-pointer rounded-full px-3.5 py-2 text-[14px] font-medium transition-colors duration-150 ${
      selected ? "bg-accent text-accent-ink" : "bg-fill text-ink-secondary"
    }`;
  }

  return (
    <div className="px-2">
      <h2 className="px-1 pt-2 text-lg font-semibold tracking-tight">
        오늘은 어떤 책이 읽고 싶나요?
      </h2>

      <div className="mt-4 flex flex-wrap gap-2">
        {MOOD_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setMood(mood === option ? null : option)}
            className={chipClass(mood === option)}
          >
            {option}
          </button>
        ))}
      </div>

      <h3 className="mt-6 px-1 text-sm font-semibold text-ink-secondary">
        지금 읽을 시간은 얼마나 있나요? <span className="font-normal text-ink-tertiary">(선택)</span>
      </h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {TIME_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setTime(time === option ? null : option)}
            className={chipClass(time === option)}
          >
            {option}
          </button>
        ))}
      </div>

      <motion.button
        type="button"
        whileTap={{ scale: 0.97 }}
        disabled={mood === null && time === null}
        onClick={() =>
          onSubmit({
            ...(mood ? { mood } : {}),
            ...(time ? { timeAvailable: time } : {}),
          })
        }
        className="mt-7 w-full cursor-pointer rounded-2xl bg-accent py-3.5 text-[15px] font-semibold text-accent-ink disabled:opacity-40"
      >
        이 기분에 맞춰 추천 받기
      </motion.button>
    </div>
  );
}
