"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import BookSearch from "@/components/read/BookSearch";
import BookCover from "@/components/BookCover";
import {
  AGE_RANGE_OPTIONS,
  GENDER_OPTIONS,
  GENRE_OPTIONS,
  READING_PURPOSE_OPTIONS,
} from "@/lib/constants";
import { getRepository } from "@/lib/repository";
import type { BookRef, BookSearchResult, FictionPreference } from "@/lib/types";

// 온보딩 단계 정의 — 한 화면 한 질문 (스펙 §39)
// Onboarding steps — one question per screen (spec §39)
const STEPS = [
  "favoriteGenres",
  "dislikedGenres",
  "lovedBooks",
  "dislikedBooks",
  "fiction",
  "purposes",
  "ageGender",
] as const;

type Step = (typeof STEPS)[number];

const STEP_TITLES: Record<Step, string> = {
  favoriteGenres: "어떤 장르를 좋아하세요?",
  dislikedGenres: "피하고 싶은 장르가 있나요?",
  lovedBooks: "인상 깊게 읽은 책이 있나요?",
  dislikedBooks: "기대와 달랐던 책이 있나요?",
  fiction: "어느 쪽에 더 끌리세요?",
  purposes: "책에서 무엇을 얻고 싶으세요?",
  ageGender: "마지막이에요, 살짝만 알려주세요",
};

const FICTION_OPTIONS: { value: FictionPreference; label: string; description: string }[] = [
  { value: "fiction", label: "픽션", description: "소설, 이야기 속으로" },
  { value: "nonfiction", label: "논픽션", description: "지식, 실제 세계" },
  { value: "both", label: "둘 다 좋아요", description: "가리지 않아요" },
];

interface OnboardingWizardProps {
  onComplete: () => void;
}

function toBookRef(result: BookSearchResult): BookRef {
  return {
    title: result.title,
    authors: result.authors,
    isbn13: result.isbn13,
    coverUrl: result.coverUrl,
  };
}

export default function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [favoriteGenres, setFavoriteGenres] = useState<string[]>([]);
  const [dislikedGenres, setDislikedGenres] = useState<string[]>([]);
  const [lovedBooks, setLovedBooks] = useState<BookRef[]>([]);
  const [dislikedBooks, setDislikedBooks] = useState<BookRef[]>([]);
  const [fictionPreference, setFictionPreference] = useState<FictionPreference | null>(null);
  const [purposes, setPurposes] = useState<string[]>([]);
  // 선택 응답 — 미응답 허용, 추천 가중치 최하 (스펙 §40–41)
  // Optional answers — may stay empty, lowest recommendation weight (spec §40–41)
  const [ageRange, setAgeRange] = useState<string | null>(null);
  const [gender, setGender] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  // 선택형 단계는 건너뛸 수 있고, 필수 단계는 최소 1개 선택이 필요하다
  // Optional steps can be skipped; required steps need at least one selection
  const canProceed =
    step === "favoriteGenres"
      ? favoriteGenres.length > 0
      : step === "fiction"
        ? fictionPreference !== null
        : step === "purposes"
          ? purposes.length > 0
          : true;

  function toggleItem(list: string[], setList: (next: string[]) => void, item: string) {
    setList(list.includes(item) ? list.filter((entry) => entry !== item) : [...list, item]);
  }

  function toggleBook(list: BookRef[], setList: (next: BookRef[]) => void, book: BookRef) {
    const exists = list.some(
      (entry) => entry.title === book.title && entry.isbn13 === book.isbn13,
    );
    setList(
      exists
        ? list.filter((entry) => !(entry.title === book.title && entry.isbn13 === book.isbn13))
        : [...list, book],
    );
  }

  async function handleFinish() {
    if (!fictionPreference) {
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      await getRepository().savePreferenceProfile({
        favoriteGenres,
        dislikedGenres,
        lovedBooks,
        dislikedBooks,
        fictionPreference,
        readingPurposes: purposes,
        ...(ageRange ? { ageRange } : {}),
        ...(gender && gender !== "응답하지 않음" ? { gender } : {}),
        updatedAt: Date.now(),
      });
      onComplete();
    } catch (error) {
      console.error("[Onboarding] failed to save preferences:", error);
      setSaveError("답변을 저장하지 못했어요. 다시 시도해 주세요.");
      setSaving(false);
    }
  }

  function renderGenreChips(list: string[], setList: (next: string[]) => void) {
    return (
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {GENRE_OPTIONS.map((genre) => {
          const selected = list.includes(genre);
          return (
            <button
              key={genre}
              type="button"
              onClick={() => toggleItem(list, setList, genre)}
              className={`rounded-full px-4 py-2 text-[14px] font-medium transition-colors duration-150 ${
                selected ? "bg-accent text-accent-ink" : "bg-fill text-ink-secondary"
              }`}
            >
              {genre}
            </button>
          );
        })}
      </div>
    );
  }

  function renderBookPicker(list: BookRef[], setList: (next: BookRef[]) => void) {
    return (
      <div className="mt-4">
        {list.length > 0 && (
          <div className="scrollbar-none -mx-1 mb-3 flex gap-3 overflow-x-auto px-1 py-1">
            {list.map((book) => (
              <button
                key={`${book.title}-${book.isbn13}`}
                type="button"
                onClick={() => toggleBook(list, setList, book)}
                title="선택 해제"
                className="shrink-0"
              >
                <BookCover title={book.title} coverUrl={book.coverUrl} size="sm" />
              </button>
            ))}
          </div>
        )}
        <BookSearch onSelect={(result) => toggleBook(list, setList, toBookRef(result))} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pt-8 pb-12">
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="이전"
          onClick={() => setStepIndex((index) => Math.max(0, index - 1))}
          className={`-ml-2 flex size-9 items-center justify-center rounded-full text-xl text-tint active:bg-fill ${
            stepIndex === 0 ? "invisible" : ""
          }`}
        >
          ‹
        </button>
        <div className="flex gap-1.5" aria-label={`${stepIndex + 1} / ${STEPS.length} 단계`}>
          {STEPS.map((candidate, index) => (
            <span
              key={candidate}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                index === stepIndex ? "w-5 bg-ink" : "w-1.5 bg-ink-tertiary/40"
              }`}
            />
          ))}
        </div>
        <span className="w-9" />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="mt-10 flex-1"
        >
          <h1 className="text-center text-xl font-bold tracking-tight break-keep">
            {STEP_TITLES[step]}
          </h1>

          {step === "favoriteGenres" && renderGenreChips(favoriteGenres, setFavoriteGenres)}
          {step === "dislikedGenres" && renderGenreChips(dislikedGenres, setDislikedGenres)}
          {step === "lovedBooks" && renderBookPicker(lovedBooks, setLovedBooks)}
          {step === "dislikedBooks" && renderBookPicker(dislikedBooks, setDislikedBooks)}

          {step === "fiction" && (
            <div className="mt-8 flex flex-col gap-2.5">
              {FICTION_OPTIONS.map((option) => {
                const selected = fictionPreference === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFictionPreference(option.value)}
                    className={`rounded-2xl px-5 py-4 text-left transition-colors duration-150 ${
                      selected ? "bg-accent text-accent-ink" : "bg-fill"
                    }`}
                  >
                    <p className="text-[15px] font-semibold">{option.label}</p>
                    <p
                      className={`mt-0.5 text-sm ${
                        selected ? "text-accent-ink/70" : "text-ink-secondary"
                      }`}
                    >
                      {option.description}
                    </p>
                  </button>
                );
              })}
            </div>
          )}

          {step === "ageGender" && (
            <div className="mt-6">
              <p className="text-center text-sm text-ink-tertiary">
                응답하지 않아도 괜찮아요 — 추천에는 아주 살짝만 반영돼요
              </p>
              <h3 className="mt-5 text-sm font-semibold text-ink-secondary">연령대</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {AGE_RANGE_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setAgeRange(ageRange === option ? null : option)}
                    className={`cursor-pointer rounded-full px-3.5 py-2 text-[14px] font-medium transition-colors duration-150 ${
                      ageRange === option ? "bg-accent text-accent-ink" : "bg-fill text-ink-secondary"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <h3 className="mt-5 text-sm font-semibold text-ink-secondary">성별</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {GENDER_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setGender(gender === option ? null : option)}
                    className={`cursor-pointer rounded-full px-3.5 py-2 text-[14px] font-medium transition-colors duration-150 ${
                      gender === option ? "bg-accent text-accent-ink" : "bg-fill text-ink-secondary"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === "purposes" && (
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {READING_PURPOSE_OPTIONS.map((purpose) => {
                const selected = purposes.includes(purpose);
                return (
                  <button
                    key={purpose}
                    type="button"
                    onClick={() => toggleItem(purposes, setPurposes, purpose)}
                    className={`rounded-full px-4 py-2 text-[14px] font-medium transition-colors duration-150 ${
                      selected ? "bg-accent text-accent-ink" : "bg-fill text-ink-secondary"
                    }`}
                  >
                    {purpose}
                  </button>
                );
              })}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {saveError !== "" && <p className="mt-3 text-center text-sm text-danger">{saveError}</p>}

      <motion.button
        type="button"
        whileTap={{ scale: 0.97 }}
        disabled={!canProceed || saving}
        onClick={() => {
          if (isLast) {
            void handleFinish();
          } else {
            setStepIndex((index) => index + 1);
          }
        }}
        className="mt-6 w-full rounded-2xl bg-accent py-4 text-lg font-semibold text-accent-ink disabled:opacity-40"
      >
        {isLast ? (saving ? "저장하는 중…" : "완료") : "다음"}
      </motion.button>

      {(step === "dislikedGenres" ||
        step === "lovedBooks" ||
        step === "dislikedBooks") && (
        <button
          type="button"
          onClick={() => setStepIndex((index) => index + 1)}
          className="mt-3 text-sm font-medium text-ink-tertiary active:opacity-70"
        >
          건너뛰기
        </button>
      )}
    </div>
  );
}
