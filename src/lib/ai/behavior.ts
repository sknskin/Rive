import type {
  BehaviorBookEntry,
  BehaviorSnapshot,
  PreferencePayload,
} from "@/lib/ai/contracts";
import { hourHistogram, peakHourWindow, readingSpeedPagesPerHour } from "@/lib/insights";
import { getRepository } from "@/lib/repository";
import type { PreferenceProfile } from "@/lib/types";

const SECONDS_PER_MINUTE = 60;

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

// AI에 보낼 행동 데이터 수집 — 제목/저자/상태/평점만, 식별 정보 없음 (스펙 §69)
// Collect behavior data for the AI — titles/authors/status/ratings only, no identifiers (spec §69)
export async function collectBehaviorSnapshot(): Promise<BehaviorSnapshot> {
  const repository = getRepository();
  const userBooks = await repository.listUserBooks();
  const sessions = await repository.listAllSessions();

  // 책마다 개별 조회하지 않고 한 번에 가져온다 — N+1 방지 (6차 조사 D3)
  // Fetch all books at once instead of per-book lookups — avoids N+1 (audit 6 D3)
  const booksById = await repository.listBooksByIds(
    userBooks.map((userBook) => userBook.bookId),
  );

  const books: BehaviorBookEntry[] = [];
  for (const userBook of userBooks) {
    const book = booksById.get(userBook.bookId);
    if (!book) {
      continue;
    }
    books.push({
      title: book.title,
      authors: book.authors,
      status: userBook.status,
      ...(userBook.rating !== undefined && userBook.rating > 0
        ? { rating: userBook.rating }
        : {}),
      ...(userBook.dnfReason ? { dnfReason: userBook.dnfReason } : {}),
      // 완독 추가 평가가 있으면 취향 분석 신호로 함께 보낸다 (스펙 §25)
      // Include extra finish ratings as taste signals when present (spec §25)
      ...(userBook.extraRatings && Object.keys(userBook.extraRatings).length > 0
        ? { extraRatings: userBook.extraRatings }
        : {}),
    });
  }

  const peak = peakHourWindow(hourHistogram(sessions));
  const totalSeconds = sessions.reduce((sum, session) => sum + session.durationSeconds, 0);

  // 추천 피드백을 학습 신호로 전달한다 (스펙 §50)
  // Forward recommendation feedback as learning signals (spec §50)
  const recommendations = await repository.listRecommendations();
  const likedBooks = recommendations
    .filter((item) => item.status === "liked")
    .map((item) => item.book.title);
  const notInterested = recommendations
    .filter((item) => item.status === "notInterested")
    .map((item) => ({ title: item.book.title, reason: item.feedbackReason ?? "" }));

  return {
    books,
    totalSessions: sessions.length,
    totalMinutes: Math.round(totalSeconds / SECONDS_PER_MINUTE),
    readingSpeedPagesPerHour: readingSpeedPagesPerHour(sessions),
    peakHours: peak ? `${formatHour(peak.startHour)}-${formatHour(peak.endHour)}` : null,
    likedBooks,
    notInterested,
  };
}

export function toPreferencePayload(profile: PreferenceProfile): PreferencePayload {
  return {
    favoriteGenres: profile.favoriteGenres,
    dislikedGenres: profile.dislikedGenres,
    lovedBooks: profile.lovedBooks.map((book) => ({
      title: book.title,
      authors: book.authors,
    })),
    dislikedBooks: profile.dislikedBooks.map((book) => ({
      title: book.title,
      authors: book.authors,
    })),
    fictionPreference: profile.fictionPreference,
    readingPurposes: profile.readingPurposes,
    ...(profile.ageRange ? { ageRange: profile.ageRange } : {}),
    ...(profile.gender ? { gender: profile.gender } : {}),
  };
}

// 이미 서재에 있는 책 + 피드백으로 거른 책은 추천 후보에서 제외한다 (스펙 §50)
// Exclude library books and feedback-filtered books from candidates (spec §50)
export async function collectExcludeTitles(): Promise<string[]> {
  const repository = getRepository();
  const titles: string[] = [];

  const userBooks = await repository.listUserBooks();
  const booksById = await repository.listBooksByIds(
    userBooks.map((userBook) => userBook.bookId),
  );
  for (const userBook of userBooks) {
    const book = booksById.get(userBook.bookId);
    if (book) {
      titles.push(book.title);
    }
  }

  const recommendations = await repository.listRecommendations();
  for (const recommendation of recommendations) {
    if (recommendation.status === "notInterested" || recommendation.status === "alreadyRead") {
      titles.push(recommendation.book.title);
    }
  }

  return titles;
}
