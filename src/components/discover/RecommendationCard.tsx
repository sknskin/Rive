"use client";

import { useState } from "react";
import Link from "next/link";
import BookCover from "@/components/BookCover";
import type { AiRecommendation } from "@/lib/types";

interface RecommendationCardProps {
  recommendation: AiRecommendation;
  onWantToRead: () => void;
  onNotInterested: () => void;
  onAlreadyRead: () => void;
}

// AI 추천 카드 — 표지 중심 + 설명 가능한 추천 (스펙 §48–49)
// AI recommendation card — cover-centric with explainability (spec §48–49)
export default function RecommendationCard({
  recommendation,
  onWantToRead,
  onNotInterested,
  onAlreadyRead,
}: RecommendationCardProps) {
  const [showReason, setShowReason] = useState(false);
  const { book, matchPercent, status } = recommendation;

  return (
    <article className="rounded-2xl bg-elevated p-4 ring-1 ring-separator">
      <div className="flex gap-4">
        <BookCover title={book.title} coverUrl={book.coverUrl} size="md" />
        <div className="min-w-0 flex-1">
          <p className="nums text-[13px] font-semibold text-tint">{matchPercent}% Match</p>
          <h3 className="mt-1 text-[17px] leading-snug font-semibold tracking-tight break-keep">
            {book.title}
          </h3>
          {book.authors.length > 0 && (
            <p className="mt-0.5 truncate text-sm text-ink-secondary">
              {book.authors.join(", ")}
            </p>
          )}
          <button
            type="button"
            onClick={() => setShowReason((visible) => !visible)}
            className="mt-2 text-[13px] font-medium text-tint active:opacity-70"
          >
            왜 추천했나요? {showReason ? "▴" : "▾"}
          </button>
        </div>
      </div>

      {showReason && (
        <p className="mt-3 rounded-xl bg-fill px-3.5 py-2.5 text-sm leading-relaxed break-keep text-ink-secondary">
          {recommendation.reason}
        </p>
      )}

      {status === "want" ? (
        <div className="mt-3 flex items-center justify-center gap-3 py-1.5 text-sm">
          <span className="font-medium text-tint">읽고 싶은 책에 담았어요 ✓</span>
          <Link
            href="/library?status=want"
            className="font-semibold text-ink-secondary underline-offset-2 hover:underline active:opacity-70"
          >
            서재에서 보기
          </Link>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onWantToRead}
            className="flex-1 cursor-pointer rounded-xl bg-accent px-1 py-2.5 text-[13px] font-semibold whitespace-nowrap text-accent-ink active:opacity-80"
          >
            읽고 싶어요
          </button>
          <button
            type="button"
            onClick={onAlreadyRead}
            className="flex-1 cursor-pointer rounded-xl bg-fill px-1 py-2.5 text-[13px] font-medium break-keep whitespace-nowrap text-ink-secondary active:opacity-70"
          >
            이미 읽었어요
          </button>
          <button
            type="button"
            onClick={onNotInterested}
            className="flex-1 cursor-pointer rounded-xl bg-fill px-1 py-2.5 text-[13px] font-medium break-keep whitespace-nowrap text-ink-secondary active:opacity-70"
          >
            관심 없어요
          </button>
        </div>
      )}
    </article>
  );
}
