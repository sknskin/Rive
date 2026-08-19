"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import BottomSheet from "@/components/BottomSheet";
import type { AiErrorResponse } from "@/lib/ai/contracts";
import { formatDurationShort } from "@/lib/format";
import { getRepository } from "@/lib/repository";
import type { WrappedStats } from "@/lib/wrapped";

// 리캡 시트 — 통계 카드 + AI 한 줄 요약(캐시) + 이미지 저장 (스펙 §58, §82 공유 이미지)
// Wrapped sheet — stat card, cached AI one-liner, image download (spec §58, §82)
interface WrappedSheetProps {
  open: boolean;
  onClose: () => void;
  stats: WrappedStats | null;
}

export default function WrappedSheet({ open, onClose, stats }: WrappedSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose}>
      {stats && <WrappedContent stats={stats} />}
    </BottomSheet>
  );
}

const CARD_WIDTH = 600;
const CARD_HEIGHT = 800;

function WrappedContent({ stats }: { stats: WrappedStats }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [aiError, setAiError] = useState("");

  // 캐시된 요약이 있으면 재호출 없이 사용한다 (스펙 §65)
  // Reuse the cached summary without another call (spec §65)
  useEffect(() => {
    let cancelled = false;
    getRepository()
      .getWrapped(stats.id)
      .then((cached) => {
        if (!cancelled && cached) {
          setSummary(cached.summary);
        }
      })
      .catch((error) => console.error("[Wrapped] failed to read cache:", error));
    return () => {
      cancelled = true;
    };
  }, [stats.id]);

  async function handleSummarize() {
    setSummarizing(true);
    setAiError("");
    try {
      const response = await fetch("/api/ai/wrapped", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stats),
      });
      const body = (await response.json()) as { summary: string } & AiErrorResponse;
      if (!response.ok) {
        setAiError(body.error);
        return;
      }
      await getRepository().saveWrapped({
        id: stats.id,
        summary: body.summary,
        generatedAt: Date.now(),
      });
      setSummary(body.summary);
    } catch (error) {
      console.error("[Wrapped] summary failed:", error);
      setAiError("요약을 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSummarizing(false);
    }
  }

  // 공유 이미지 — 의존성 없이 Canvas로 직접 그린다
  // Share image — drawn directly on a canvas, no dependencies
  function handleDownloadImage() {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = CARD_WIDTH;
      canvas.height = CARD_HEIGHT;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }
      ctx.fillStyle = "#111113";
      ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
      ctx.fillStyle = "rgba(235,235,245,0.6)";
      ctx.font = "500 26px -apple-system, 'Apple SD Gothic Neo', sans-serif";
      ctx.fillText(stats.label + "의 독서", 56, 104);
      ctx.fillStyle = "#f2f2f7";
      ctx.font = "200 84px -apple-system, sans-serif";
      ctx.fillText(formatDurationShort(stats.totalSeconds), 56, 210);

      const lines: string[] = [
        `${stats.totalPages.toLocaleString()} 페이지`,
        `${stats.readingDays}일 독서 · 기록 ${stats.sessionCount}회`,
        ...(stats.finishedBooks > 0 ? [`${stats.finishedBooks}권 완독`] : []),
        ...(stats.longestSessionSeconds > 0
          ? [`가장 긴 독서 ${formatDurationShort(stats.longestSessionSeconds)}`]
          : []),
        ...(stats.topAuthor ? [`가장 함께한 작가 · ${stats.topAuthor}`] : []),
        ...(stats.topGenre ? [`가장 머문 장르 · ${stats.topGenre}`] : []),
      ];
      ctx.font = "400 30px -apple-system, 'Apple SD Gothic Neo', sans-serif";
      ctx.fillStyle = "rgba(235,235,245,0.85)";
      lines.forEach((line, index) => {
        ctx.fillText(line, 56, 300 + index * 54);
      });

      if (summary) {
        ctx.font = "400 24px 'Apple SD Gothic Neo', sans-serif";
        ctx.fillStyle = "rgba(235,235,245,0.6)";
        wrapText(ctx, `“${summary}”`, 56, 640, CARD_WIDTH - 112, 36);
      }

      ctx.font = "700 28px -apple-system, sans-serif";
      ctx.fillStyle = "#f2f2f7";
      ctx.fillText("Rive", 56, CARD_HEIGHT - 56);

      canvas.toBlob((blob) => {
        if (!blob) {
          return;
        }
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `rive-wrapped-${stats.id}.png`;
        anchor.click();
        URL.revokeObjectURL(url);
      });
    } catch (error) {
      console.error("[Wrapped] failed to render image:", error);
      setAiError("이미지를 만들지 못했어요.");
    }
  }

  return (
    <div className="px-2 pt-2">
      <h2 className="px-1 text-lg font-semibold tracking-tight">{stats.label}의 독서</h2>

      <div className="nums mt-4 rounded-2xl bg-fill/60 px-5 py-5">
        <p className="text-3xl font-light tracking-tight">
          {formatDurationShort(stats.totalSeconds)}
        </p>
        <div className="mt-3 flex flex-col gap-1.5 text-[15px] text-ink-secondary">
          <span>{stats.totalPages.toLocaleString()} 페이지</span>
          <span>
            {stats.readingDays}일 독서 · 기록 {stats.sessionCount}회
          </span>
          {stats.finishedBooks > 0 && <span>{stats.finishedBooks}권 완독</span>}
          {stats.longestSessionSeconds > 0 && (
            <span>가장 긴 독서 {formatDurationShort(stats.longestSessionSeconds)}</span>
          )}
          {stats.topAuthor && <span>가장 함께한 작가 · {stats.topAuthor}</span>}
          {stats.topGenre && <span>가장 머문 장르 · {stats.topGenre}</span>}
        </div>
      </div>

      {summary ? (
        <p className="mt-4 px-1 text-[15px] leading-relaxed break-keep text-ink-secondary">
          “{summary}”
        </p>
      ) : (
        <button
          type="button"
          disabled={summarizing}
          onClick={() => void handleSummarize()}
          className="mt-4 w-full cursor-pointer rounded-2xl bg-fill py-3 text-sm font-semibold text-tint active:opacity-70 disabled:opacity-40"
        >
          {summarizing ? "요약 만드는 중…" : "AI 한 줄 요약 만들기"}
        </button>
      )}

      {aiError !== "" && <p className="mt-2 text-center text-sm text-danger">{aiError}</p>}

      <motion.button
        type="button"
        whileTap={{ scale: 0.97 }}
        onClick={handleDownloadImage}
        className="mt-4 w-full cursor-pointer rounded-2xl bg-accent py-3.5 text-[15px] font-semibold text-accent-ink"
      >
        이미지로 저장
      </motion.button>
    </div>
  );
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): void {
  const words = text.split(" ");
  let line = "";
  let cursorY = y;
  for (const word of words) {
    const candidate = line === "" ? word : `${line} ${word}`;
    if (ctx.measureText(candidate).width > maxWidth && line !== "") {
      ctx.fillText(line, x, cursorY);
      line = word;
      cursorY += lineHeight;
    } else {
      line = candidate;
    }
  }
  ctx.fillText(line, x, cursorY);
}
