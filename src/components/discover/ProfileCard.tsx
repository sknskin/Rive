"use client";

import { useState } from "react";
import { formatShortDate, formatTimeOfDay } from "@/lib/format";
import type { AiProfile } from "@/lib/types";

interface ProfileCardProps {
  profile: AiProfile;
  analyzing: boolean;
  onReanalyze: () => void;
}

// AI Reading Profile — 결론과 근거를 함께 보여준다 (스펙 §44–45)
// AI reading profile — conclusion plus evidence (spec §44–45)
export default function ProfileCard({ profile, analyzing, onReanalyze }: ProfileCardProps) {
  const [showEvidence, setShowEvidence] = useState(false);

  return (
    <section aria-label="AI 독서 프로필" className="rounded-2xl bg-elevated p-5 ring-1 ring-separator">
      <div className="flex items-start justify-between">
        <h2 className="text-lg font-bold tracking-tight">{profile.profileType}</h2>
        <button
          type="button"
          onClick={onReanalyze}
          disabled={analyzing}
          className="shrink-0 text-[13px] font-medium text-tint active:opacity-70 disabled:opacity-40"
        >
          {analyzing ? "분석 중…" : "다시 분석"}
        </button>
      </div>

      <p className="mt-2 text-[15px] leading-relaxed break-keep text-ink-secondary">
        {profile.summary}
      </p>
      <p className="nums mt-1.5 text-xs text-ink-tertiary">
        {formatShortDate(profile.analyzedAt)} {formatTimeOfDay(profile.analyzedAt)} 분석
      </p>

      {profile.genres.length > 0 && (
        <div className="mt-5 flex flex-col gap-2.5">
          {profile.genres.map((genre) => (
            <div key={genre.name} className="flex items-center gap-3">
              <span className="w-16 shrink-0 text-[13px] font-medium">{genre.name}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-fill">
                <div
                  className="h-full rounded-full bg-tint transition-[width] duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, genre.score))}%` }}
                />
              </div>
              <span className="nums w-7 shrink-0 text-right text-[13px] text-ink-secondary">
                {genre.score}
              </span>
            </div>
          ))}
        </div>
      )}

      {profile.traits.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {profile.traits.map((trait) => (
            <span
              key={trait}
              className="rounded-full bg-fill px-2.5 py-1 text-xs font-medium text-ink-secondary"
            >
              {trait}
            </span>
          ))}
        </div>
      )}

      {profile.evidence.length > 0 && (
        <div className="mt-4 border-t border-separator pt-3">
          <button
            type="button"
            onClick={() => setShowEvidence((visible) => !visible)}
            className="text-sm font-medium text-tint active:opacity-70"
          >
            왜 이런 분석이 나왔나요? {showEvidence ? "▴" : "▾"}
          </button>
          {showEvidence && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {profile.evidence.map((item) => (
                <li key={item} className="text-sm break-keep text-ink-secondary">
                  · {item}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
