import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getUserFromRequest: vi.fn(),
  consumeDailyAiQuota: vi.fn(),
}));
const geminiMocks = vi.hoisted(() => ({
  generateJson: vi.fn(),
  generateJsonFromImage: vi.fn(),
}));

vi.mock("@/lib/supabase/serverAuth", () => authMocks);
vi.mock("@/lib/ai/gemini", () => geminiMocks);

import { POST as postProfile } from "./profile/route";
import { POST as postQuoteOcr } from "./quote-ocr/route";
import { POST as postRecommend } from "./recommend/route";
import { POST as postWrapped } from "./wrapped/route";

function jsonRequest(path: string, body: unknown): Request {
  return new Request(`http://test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const preference = {
  favoriteGenres: [],
  dislikedGenres: [],
  lovedBooks: [],
  dislikedBooks: [],
  fictionPreference: "both",
  readingPurposes: [],
};
const behavior = {
  books: [],
  totalSessions: 0,
  totalMinutes: 0,
  readingSpeedPagesPerHour: 0,
  peakHours: null,
  likedBooks: [],
  notInterested: [],
};
const profile = {
  profileType: "탐구형",
  summary: "요약",
  genres: [],
  traits: [],
  recommendationFactors: [],
  evidence: [],
  tasteChanges: [],
  dna: { fiction: 50, depth: 50, emotion: 50, exploration: 50 },
  bookTwin: { title: "", reason: "" },
};
const wrapped = {
  label: "2026년",
  totalSeconds: 0,
  totalPages: 0,
  readingDays: 0,
  finishedBooks: 0,
  topAuthor: null,
  topGenre: null,
};

describe("AI route request validation", () => {
  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    authMocks.getUserFromRequest.mockResolvedValue({ token: "user-token" });
    authMocks.consumeDailyAiQuota.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it.each([
    ["profile", postProfile, "/api/ai/profile", { preference: null, behavior: {} }],
    ["recommend", postRecommend, "/api/ai/recommend", { preference: {}, profile: null }],
    [
      "recommend non-string excludes",
      postRecommend,
      "/api/ai/recommend",
      { preference, behavior, profile, excludeTitles: [{}] },
    ],
    ["quote OCR", postQuoteOcr, "/api/ai/quote-ocr", { imageBase64: "abc", mimeType: "text/plain" }],
    ["wrapped", postWrapped, "/api/ai/wrapped", { label: "" }],
    ["wrapped coerced values", postWrapped, "/api/ai/wrapped", { ...wrapped, totalPages: {} }],
  ])("%s rejects an invalid body without consuming quota", async (_name, handler, path, body) => {
    const response = await handler(jsonRequest(path, body));

    expect(response.status).toBe(400);
    expect(authMocks.consumeDailyAiQuota).not.toHaveBeenCalled();
  });

  it("profile rejects an oversized body without consuming quota", async () => {
    const request = new Request("http://test/api/ai/profile", {
      method: "POST",
      body: "x".repeat(200_001),
    });
    const response = await postProfile(request);
    expect(response.status).toBe(400);
    expect(authMocks.consumeDailyAiQuota).not.toHaveBeenCalled();
  });

  const validRequests = [
    ["profile", postProfile, "/api/ai/profile", { preference, behavior }],
    ["recommend", postRecommend, "/api/ai/recommend", { preference, behavior, profile, excludeTitles: [] }],
    ["quote OCR", postQuoteOcr, "/api/ai/quote-ocr", { imageBase64: "abc", mimeType: "image/jpeg" }],
    ["wrapped", postWrapped, "/api/ai/wrapped", wrapped],
  ] as const;

  it.each(validRequests)("%s returns 401 when authentication is missing", async (_name, handler, path, body) => {
    authMocks.getUserFromRequest.mockResolvedValueOnce(null);
    const response = await handler(jsonRequest(path, body));
    expect(response.status).toBe(401);
    expect(authMocks.consumeDailyAiQuota).not.toHaveBeenCalled();
  });

  it.each(validRequests)("%s returns 429 when daily quota is exhausted", async (_name, handler, path, body) => {
    authMocks.consumeDailyAiQuota.mockResolvedValueOnce(false);
    const response = await handler(jsonRequest(path, body));
    expect(response.status).toBe(429);
  });

  it("returns 502 when Gemini profile generation fails", async () => {
    geminiMocks.generateJson.mockRejectedValueOnce(new Error("provider unavailable"));
    const response = await postProfile(
      jsonRequest("/api/ai/profile", { preference, behavior }),
    );
    expect(response.status).toBe(502);
  });
});
