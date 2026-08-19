"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import PageSkeleton from "@/components/PageSkeleton";
import MoodSheet from "@/components/discover/MoodSheet";
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
import { enrichBookMeta } from "@/lib/enrichBook";
import { notifyLibraryChange } from "@/lib/libraryEvents";
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
  const [moodOpen, setMoodOpen] = useState(false);
  // 마지막 맞춤 조건 — 목록 헤더에 표시한다
  // Last tailoring context — shown in the list header
  const [lastContext, setLastContext] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const repository = getRepository();
    try {
      // 서로 독립적인 조회는 병렬로 실행한다 (6차 조사 D4)
      // Run independent reads in parallel (audit 6 D4)
      const [loadedPreference, loadedProfile, loadedRecommendations] = await Promise.all([
        repository.getPreferenceProfile(),
        repository.getAiProfile(),
        repository.listRecommendations(),
      ]);
      setProfile(loadedProfile ?? null);
      // 거절/이미 읽음 피드백을 남긴 추천은 목록에서 감춘다
      // Hide recommendations dismissed via feedback
      setRecommendations(
        loadedRecommendations.filter(
          (item) =>
            item.status === "active" || item.status === "want" || item.status === "liked",
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
        tasteChanges: body.tasteChanges ?? [],
        dna: body.dna,
        bookTwin: body.bookTwin,
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

  const runRecommend = useCallback(
    async (options?: { mood?: string; timeAvailable?: string }) => {
      const repository = getRepository();
      const currentPreference = await repository.getPreferenceProfile();
      const currentProfile = await repository.getAiProfile();
      if (!currentPreference || !currentProfile) {
        return;
      }
      setRecommending(true);
      setAiError("");
      setMissingKey(false);
      setLastContext(
        options ? [options.mood, options.timeAvailable].filter(Boolean).join(" · ") : null,
      );
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
              tasteChanges: currentProfile.tasteChanges ?? [],
              // 구버전 프로필(신규 필드 부재) 호환용 중립 기본값
              // Neutral defaults for profiles analyzed before these fields existed
              dna: currentProfile.dna ?? { fiction: 50, depth: 50, emotion: 50, exploration: 50 },
              bookTwin: currentProfile.bookTwin ?? { title: "", reason: "" },
            },
            excludeTitles: await collectExcludeTitles(),
            ...(options?.mood ? { mood: options.mood } : {}),
            ...(options?.timeAvailable ? { timeAvailable: options.timeAvailable } : {}),
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
            category: item.category,
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
    },
    [reload],
  );

  async function handleWantToRead(recommendation: AiRecommendation) {
    const repository = getRepository();
    try {
      // 추천 책을 실제 Library의 Want to Read에 등록한다 (스펙 §50)
      // Register the recommended book into Want to Read (spec §50)
      const book = await repository.upsertBookByIsbn(recommendation.book);
      await repository.setBookStatus(book.id, "want");
      void enrichBookMeta(book.id);
      notifyLibraryChange();
      await repository.updateRecommendation(recommendation.id, { status: "want" });
      await reload();
    } catch (error) {
      console.error("[Discover] failed to save want-to-read:", error);
      setAiError("책을 저장하지 못했어요. 다시 시도해 주세요.");
    }
  }

  async function handleToggleLike(recommendation: AiRecommendation) {
    try {
      await getRepository().updateRecommendation(recommendation.id, {
        status: recommendation.status === "liked" ? "active" : "liked",
      });
      await reload();
    } catch (error) {
      console.error("[Discover] failed to toggle like:", error);
      setAiError("피드백을 저장하지 못했어요. 다시 시도해 주세요.");
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
    return <PageSkeleton />;
  }

  if (phase === "wizard") {
    return (
      // 상위 레이아웃이 이미 min-h-dvh라 flex-1로 채운다 — 이중 100dvh 스크롤 방지
      // The layout already sets min-h-dvh; flex-1 avoids a doubled-height scroll
      <main className="flex flex-1 flex-col">
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
      <main className="flex flex-1 flex-col items-center justify-center px-8 pb-24 text-center">
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
          className="mt-8 w-full max-w-xs cursor-pointer rounded-2xl bg-accent py-4 text-lg font-semibold tracking-wide text-accent-ink shadow-sm transition-opacity hover:opacity-90"
        >
          시작하기
        </motion.button>
      </main>
    );
  }

  return (
    <main className="flex-1 px-5 pt-8 pb-20">
      <h1 className="text-2xl font-bold tracking-tight">Discover</h1>

      {aiError !== "" && (
        <div className="mt-4 rounded-xl bg-fill px-4 py-3">
          <p className="text-sm text-danger">{aiError}</p>
          {missingKey && (
            <p className="mt-1.5 text-sm break-all text-ink-secondary">{MISSING_KEY_GUIDE}</p>
          )}
        </div>
      )}

      {/* 데스크톱: 좌측 프로필(고정) / 우측 추천 목록 2단 배치 */}
      {/* Desktop: two columns — sticky profile left, recommendations right */}
      <div className="lg:grid lg:grid-cols-[minmax(0,420px)_1fr] lg:items-start lg:gap-14">
      <div className="mt-5 lg:sticky lg:top-16">
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
              className="mt-4 w-full cursor-pointer rounded-2xl bg-accent py-4 text-lg font-semibold tracking-wide text-accent-ink shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {analyzing ? "분석 중…" : "AI 취향 분석하기"}
            </motion.button>
          </div>
        )}
      </div>

      <div>
      {profile && (
        <section className="mt-8 lg:mt-5" aria-label="AI 추천">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xs font-semibold tracking-wide text-ink-tertiary uppercase">
              추천
              {lastContext && (
                <span className="ml-2 font-medium normal-case text-ink-secondary">
                  {lastContext}
                </span>
              )}
            </h2>
            <div className="flex items-baseline gap-3">
              <button
                type="button"
                disabled={recommending}
                onClick={() => setMoodOpen(true)}
                className="cursor-pointer text-sm font-medium text-tint active:opacity-70 disabled:opacity-40"
              >
                기분 맞춤
              </button>
              {recommendations.length > 0 && (
                <button
                  type="button"
                  disabled={recommending}
                  onClick={() => void runRecommend()}
                  className="cursor-pointer text-sm font-medium text-tint active:opacity-70 disabled:opacity-40"
                >
                  {recommending ? "추천 받는 중…" : "새로 추천 받기"}
                </button>
              )}
            </div>
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
                className="mt-4 w-full cursor-pointer rounded-2xl bg-accent py-4 text-lg font-semibold tracking-wide text-accent-ink shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {recommending ? "추천 받는 중…" : "추천 받기"}
              </motion.button>
            </div>
          ) : (
            // 카테고리별 그룹핑 — For You / Because You Loved 등 (스펙 §52)
            // Grouped by category — For You / Because You Loved etc. (spec §52)
            <div className="mt-3 flex flex-col gap-6">
              {[...new Set(recommendations.map((item) => item.category ?? "For You"))].map(
                (category) => (
                  <div key={category}>
                    <h3 className="mb-2 text-[13px] font-semibold text-ink-secondary">
                      {category}
                    </h3>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                      {recommendations
                        .filter((item) => (item.category ?? "For You") === category)
                        .map((recommendation) => (
                          <RecommendationCard
                            key={recommendation.id}
                            recommendation={recommendation}
                            onWantToRead={() => void handleWantToRead(recommendation)}
                            onAlreadyRead={() => void handleAlreadyRead(recommendation)}
                            onNotInterested={() => setNotInterestedTarget(recommendation.id)}
                            onToggleLike={() => void handleToggleLike(recommendation)}
                          />
                        ))}
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </section>
      )}
      </div>
      </div>

      <NotInterestedSheet
        open={notInterestedTarget !== null}
        onClose={() => setNotInterestedTarget(null)}
        onSelect={(reason) => void handleNotInterested(reason)}
      />

      <MoodSheet
        open={moodOpen}
        onClose={() => setMoodOpen(false)}
        onSubmit={(options) => {
          setMoodOpen(false);
          void runRecommend(options);
        }}
      />
    </main>
  );
}
