import type {
  BehaviorSnapshot,
  PreferencePayload,
  ProfileResponse,
} from "@/lib/ai/contracts";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isBookReference(value: unknown): boolean {
  return isRecord(value) && typeof value.title === "string" && isStringArray(value.authors);
}

export function isPreferencePayload(value: unknown): value is PreferencePayload {
  return (
    isRecord(value) &&
    isStringArray(value.favoriteGenres) &&
    isStringArray(value.dislikedGenres) &&
    Array.isArray(value.lovedBooks) &&
    value.lovedBooks.every(isBookReference) &&
    Array.isArray(value.dislikedBooks) &&
    value.dislikedBooks.every(isBookReference) &&
    ["fiction", "nonfiction", "both"].includes(String(value.fictionPreference)) &&
    isStringArray(value.readingPurposes) &&
    isOptionalString(value.ageRange) &&
    isOptionalString(value.gender)
  );
}

function isBehaviorBook(value: unknown): boolean {
  if (
    !isRecord(value) ||
    typeof value.title !== "string" ||
    !isStringArray(value.authors) ||
    !["reading", "want", "read", "paused", "dnf"].includes(String(value.status)) ||
    !isOptionalString(value.dnfReason)
  ) {
    return false;
  }
  if (
    value.rating !== undefined &&
    (!isFiniteNumber(value.rating) || value.rating < 1 || value.rating > 5)
  ) {
    return false;
  }
  if (value.extraRatings !== undefined) {
    if (!isRecord(value.extraRatings)) return false;
    for (const field of ["fun", "immersion", "difficulty"] as const) {
      const rating = value.extraRatings[field];
      if (rating !== undefined && (!isFiniteNumber(rating) || rating < 1 || rating > 5)) {
        return false;
      }
    }
  }
  return true;
}

export function isBehaviorSnapshot(value: unknown): value is BehaviorSnapshot {
  return (
    isRecord(value) &&
    Array.isArray(value.books) &&
    value.books.every(isBehaviorBook) &&
    isNonNegativeNumber(value.totalSessions) &&
    isNonNegativeNumber(value.totalMinutes) &&
    isNonNegativeNumber(value.readingSpeedPagesPerHour) &&
    (value.peakHours === null || typeof value.peakHours === "string") &&
    isStringArray(value.likedBooks) &&
    Array.isArray(value.notInterested) &&
    value.notInterested.every(
      (item) => isRecord(item) && typeof item.title === "string" && typeof item.reason === "string",
    )
  );
}

function isDna(value: unknown): boolean {
  return (
    isRecord(value) &&
    [value.fiction, value.depth, value.emotion, value.exploration].every(
      (score) => isFiniteNumber(score) && score >= 0 && score <= 100,
    )
  );
}

export function isProfileResponse(value: unknown): value is ProfileResponse {
  return (
    isRecord(value) &&
    typeof value.profileType === "string" &&
    typeof value.summary === "string" &&
    Array.isArray(value.genres) &&
    value.genres.every(
      (genre) =>
        isRecord(genre) &&
        typeof genre.name === "string" &&
        isFiniteNumber(genre.score) &&
        genre.score >= 0 &&
        genre.score <= 100,
    ) &&
    isStringArray(value.traits) &&
    isStringArray(value.recommendationFactors) &&
    isStringArray(value.evidence) &&
    isStringArray(value.tasteChanges) &&
    isDna(value.dna) &&
    isRecord(value.bookTwin) &&
    typeof value.bookTwin.title === "string" &&
    typeof value.bookTwin.reason === "string"
  );
}

interface ValidWrappedStats {
  label: string;
  totalSeconds: number;
  totalPages: number;
  readingDays: number;
  finishedBooks: number;
  topAuthor?: string | null;
  topGenre?: string | null;
}

export function isWrappedStats(value: unknown): value is ValidWrappedStats {
  if (!isRecord(value) || typeof value.label !== "string" || value.label.trim() === "") {
    return false;
  }
  for (const field of ["totalSeconds", "totalPages", "readingDays", "finishedBooks"] as const) {
    if (!isNonNegativeNumber(value[field])) return false;
  }
  return (
    (value.topAuthor === null || value.topAuthor === undefined || typeof value.topAuthor === "string") &&
    (value.topGenre === null || value.topGenre === undefined || typeof value.topGenre === "string")
  );
}

export async function readJsonBody(
  request: Request,
  maxChars: number,
): Promise<unknown> {
  const raw = await request.text();
  if (raw.length === 0 || raw.length > maxChars) {
    throw new Error("invalid request body size");
  }
  return JSON.parse(raw) as unknown;
}
