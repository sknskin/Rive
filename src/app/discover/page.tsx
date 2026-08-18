"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import NotInterestedSheet from "@/components/discover/NotInterestedSheet";
import OnboardingWizard from "@/components/discover/OnboardingWizard";
import ProfileCard from "@/components/discover/ProfileCard";
import RecommendationCard from "@/components/discover/RecommendationCard";
import {
  collectBehaviorSnapshot,
  collectExcludeTitles,
  toPreferencePayload,
} from "@/lib/ai/behavior";
import type {
  AiErrorResponse,
  ProfileResponse,
  RecommendResponse,
} from "@/lib/ai/contracts";
import { getRepository } from "@/lib/repository";
import type { AiProfile, AiRecommendation } from "@/lib/types";

type Phase = "loading" | "intro" | "wizard" | "main";

const MISSING_KEY_GUIDE =
  "https://aistudio.google.com/apikey 에서 무료 키를 만들어 .env.local에 GEMINI_API_KEY=키값 으로 추가한 뒤 서버를 재시작해 주세요.";

// Discover — AI 취향 분석과 실제 책 추천 (스펙 §38–52)
// Discover — AI taste analysis and real-book recommendations (spec §38–52)
export default function DiscoverPage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [profile, setProfile] = useState<AiProfile | null>(null);
  const [recommendations, setRecommendations] = useState<AiRecommendation[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [recommending, setRecommending] = useState(false);
  const [aiError, setAiError] = useState("");
  const [missingKey, setMissingKey] = useState(false);
  const [notInterestedTarget, setNotInterestedTarget] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const repository = getRepository();
    try {
      const loadedPreference = await repository.getPreferenceProfile();
      const loadedProfile = await repository.getAiProfile();
      const loadedRecommendations = await repository.listRecommendations();
      setProfile(loadedProfile ?? null);
      // 거절/이미 읽음 피드백을 남긴 추천은 목록에서 감춘다
      // Hide recommendations dismissed via feedback
      setRecommendations(
        loadedRecommendations.filter(
          (item) => item.status === "active" || item.status === "want",
        ),
      );
      setPhase(loadedPreference ? "main" : "intro");
    } catch (error) {
      console.error("[Discover] failed to load:", error);
      setAiError("데이터를 불러오지 못했어요. 새로고침해 주세요.");
      setPhase("intro");
    }
  }, []);

  useEffect(() => {
    async function init() {
      await reload();
    }
    void init();
  }, [reload]);

  function handleAiFailure(status: number, body: AiErrorResponse) {
    setAiError(body.error);
    setMissingKey(body.missingKey === true || status === 503);
  }

  const runAnalyze = useCallback(async () => {
    const repository = getRepository();
    const currentPreference = await repository.getPreferenceProfile();
    if (!currentPreference) {
      return;
    }
    setAnalyzing(true);
    setAiError("");
    setMissingKey(false);
    try {
      const response = await fetch("/api/ai/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preference: toPreferencePayload(currentPreference),
          behavior: await collectBehaviorSnapshot(),
        }),
      });
      const body = (await response.json()) as ProfileResponse & AiErrorResponse;
      if (!response.ok) {
        handleAiFailure(response.status, body);
        return;
      }
      await repository.saveAiProfile({
        profileType: body.profileType,
        summary: body.summary,
        genres: body.genres,
        traits: body.traits,
        recommendationFactors: body.recommendationFactors,
        evidence: body.evidence,
        analyzedAt: Date.now(),
      });
      await reload();
    } catch (error) {
      console.error("[Discover] analysis failed:", error);
      setAiError("AI 분석에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setAnalyzing(false);
    }
  }, [reload]);

  const runRecommend = useCallback(async () => {
    const repository = getRepository();
    const currentPreference = await repository.getPreferenceProfile();
    const currentProfile = await repository.getAiProfile();
    if (!currentPreference || !currentProfile) {
      return;
    }
    setRecommending(true);
    setAiError("");
    setMissingKey(false);
    try {
      const response = await fetch("/api/ai/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preference: toPreferencePayload(currentPreference),
          behavior: await collectBehaviorSnapshot(),
          profile: {
            profileType: currentProfile.profileType,
            summary: currentProfile.summary,
            genres: currentProfile.genres,
            traits: currentProfile.traits,
            recommendationFactors: currentProfile.recommendationFactors,
            evidence: currentProfile.evidence,
          },
          excludeTitles: await collectExcludeTitles(),
        }),
      });
      const body = (await response.json()) as RecommendResponse & AiErrorResponse;
      if (!response.ok) {
        handleAiFailure(response.status, body);
        return;
      }
      const generatedAt = Date.now();
      await repository.replaceActiveRecommendations(
        body.items.map((item) => ({
          id: crypto.randomUUID(),
          book: item.book,
          matchPercent: item.matchPercent,
          reason: item.reason,
          generatedAt,
          status: "active" as const,
        })),
      );
      await reload();
    } catch (error) {
      console.error("[Discover] recommendation failed:", error);
      setAiError("AI 추천에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setRecommending(false);
    }
  }, [reload]);

  async function handleWantToRead(recommendation: AiRecommendation) {
    const repository = getRepository();
    try {
      // 추천 책을 실제 Library의 Want to Read에 등록한다 (스펙 §50)
      // Register the recommended book into Want to Read (spec §50)
      const book = await repository.upsertBookByIsbn(recommendation.book);
      await repository.setBookStatus(book.id, "want");
      await repository.updateRecommendation(recommendation.id, { status: "want" });
      await reload();
    } catch (error) {
      console.error("[Discover] failed to save want-to-read:", error);
      setAiError("책을 저장하지 못했어요. 다시 시도해 주세요.");
    }
  }

  async function handleAlreadyRead(recommendation: AiRecommendation) {
    try {
      await getRepository().updateRecommendation(recommendation.id, { status: "alreadyRead" });
      await reload();
    } catch (error) {
      console.error("[Discover] failed to record feedback:", error);
      setAiError("피드백을 저장하지 못했어요. 다시 시도해 주세요.");
    }
  }

  async function handleNotInterested(reason: string) {
    if (!notInterestedTarget) {
      return;
    }
    try {
      await getRepository().updateRecommendation(notInterestedTarget, {
        status: "notInterested",
        feedbackReason: reason,
      });
      setNotInterestedTarget(null);
      await reload();
    } catch (error) {
      console.error("[Discover] failed to record feedback:", error);
      setAiError("피드백을 저장하지 못했어요. 다시 시도해 주세요.");
    }
  }

  if (phase === "loading") {
    return <main className="flex-1" />;
  }

  if (phase === "wizard") {
    return (
      <main className="flex min-h-dvh flex-col">
        <OnboardingWizard
          onComplete={() => {
            void reload().then(() => runAnalyze());
          }}
        />
      </main>
    );
  }

  if (phase === "intro") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-8 pb-32 text-center">
        <p className="text-3xl">✦</p>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">AI 취향 분석</h1>
        <p className="mt-3 text-[15px] leading-relaxed break-keep text-ink-secondary">
          몇 가지 질문에 답하면 독서 취향을 분석하고,
          <br />
          실제 존재하는 책 중에서 꼭 맞는 책을 추천해 드려요.
        </p>
        {aiError !== "" && <p className="mt-4 text-sm text-danger">{aiError}</p>}
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={() => setPhase("wizard")}
          className="mt-8 w-full rounded-2xl bg-accent py-4 text-lg font-semibold text-accent-ink"
        >
          시작하기
        </motion.button>
      </main>
    );
  }

  return (
    <main className="flex-1 px-5 pt-14 pb-36">
      <h1 className="text-2xl font-bold tracking-tight">Discover</h1>

      {aiError !== "" && (
        <div className="mt-4 rounded-xl bg-fill px-4 py-3">
          <p className="text-sm text-danger">{aiError}</p>
          {missingKey && (
            <p className="mt-1.5 text-sm break-all text-ink-secondary">{MISSING_KEY_GUIDE}</p>
          )}
        </div>
      )}

      <div className="mt-5">
        {profile ? (
          <ProfileCard
            profile={profile}
            analyzing={analyzing}
            onReanalyze={() => void runAnalyze()}
          />
        ) : (
          <div className="rounded-2xl bg-elevated p-5 text-center ring-1 ring-separator">
            <p className="text-[15px] text-ink-secondary">
              설문이 끝났어요. 이제 취향을 분석해 볼까요?
            </p>
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              disabled={analyzing}
              onClick={() => void runAnalyze()}
              className="mt-4 w-full rounded-2xl bg-accent py-3.5 text-[15px] font-semibold text-accent-ink disabled:opacity-40"
            >
              {analyzing ? "분석 중…" : "AI 취향 분석하기"}
            </motion.button>
          </div>
        )}
      </div>

      {profile && (
        <section className="mt-8" aria-label="AI 추천">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xs font-semibold tracking-wide text-ink-tertiary uppercase">
              For You
            </h2>
            {recommendations.length > 0 && (
              <button
                type="button"
                disabled={recommending}
                onClick={() => void runRecommend()}
                className="text-sm font-medium text-tint active:opacity-70 disabled:opacity-40"
              >
                {recommending ? "추천 받는 중…" : "새로 추천 받기"}
              </button>
            )}
          </div>

          {recommendations.length === 0 ? (
            <div className="mt-3 rounded-2xl bg-elevated p-5 text-center ring-1 ring-separator">
              <p className="text-[15px] text-ink-secondary">
                취향에 맞는 실제 책을 찾아드릴게요.
              </p>
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                disabled={recommending}
                onClick={() => void runRecommend()}
                className="mt-4 w-full rounded-2xl bg-accent py-3.5 text-[15px] font-semibold text-accent-ink disabled:opacity-40"
              >
                {recommending ? "추천 받는 중…" : "추천 받기"}
              </motion.button>
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-3">
              {recommendations.map((recommendation) => (
                <RecommendationCard
                  key={recommendation.id}
                  recommendation={recommendation}
                  onWantToRead={() => void handleWantToRead(recommendation)}
                  onAlreadyRead={() => void handleAlreadyRead(recommendation)}
                  onNotInterested={() => setNotInterestedTarget(recommendation.id)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      <NotInterestedSheet
        open={notInterestedTarget !== null}
        onClose={() => setNotInterestedTarget(null)}
        onSelect={(reason) => void handleNotInterested(reason)}
      />
    </main>
  );
}
