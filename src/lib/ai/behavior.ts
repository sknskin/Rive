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

  const books: BehaviorBookEntry[] = [];
  for (const userBook of userBooks) {
    const book = await repository.getBook(userBook.bookId);
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
    });
  }

  const peak = peakHourWindow(hourHistogram(sessions));
  const totalSeconds = sessions.reduce((sum, session) => sum + session.durationSeconds, 0);

  return {
    books,
    totalSessions: sessions.length,
    totalMinutes: Math.round(totalSeconds / SECONDS_PER_MINUTE),
    readingSpeedPagesPerHour: readingSpeedPagesPerHour(sessions),
    peakHours: peak ? `${formatHour(peak.startHour)}-${formatHour(peak.endHour)}` : null,
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
  };
}

// 이미 서재에 있는 책 + 피드백으로 거른 책은 추천 후보에서 제외한다 (스펙 §50)
// Exclude library books and feedback-filtered books from candidates (spec §50)
export async function collectExcludeTitles(): Promise<string[]> {
  const repository = getRepository();
  const titles: string[] = [];

  const userBooks = await repository.listUserBooks();
  for (const userBook of userBooks) {
    const book = await repository.getBook(userBook.bookId);
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
