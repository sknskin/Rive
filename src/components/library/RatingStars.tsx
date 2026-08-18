"use client";

import { RATING_MAX } from "@/lib/constants";

interface RatingStarsProps {
  rating: number;
  onChange: (rating: number) => void;
}

// 완독 별점 — 탭 한 번으로 끝나는 최소 입력 (스펙 §25)
// Finished-book rating — minimal one-tap input (spec §25)
export default function RatingStars({ rating, onChange }: RatingStarsProps) {
  return (
    <div className="flex items-center justify-center gap-1" role="radiogroup" aria-label="별점">
      {Array.from({ length: RATING_MAX }, (_, index) => {
        const value = index + 1;
        const filled = value <= rating;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={value === rating}
            aria-label={`${value}점`}
            onClick={() => onChange(value)}
            className={`text-2xl transition-transform duration-100 active:scale-110 ${
              filled ? "text-tint" : "text-ink-tertiary/50"
            }`}
          >
            {filled ? "★" : "☆"}
          </button>
        );
      })}
    </div>
  );
}
