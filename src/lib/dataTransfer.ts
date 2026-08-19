import { getDb } from "@/lib/db";
import { notifyLibraryChange } from "@/lib/libraryEvents";
import {
  rowToBook,
  rowToRecommendation,
  rowToSession,
  rowToUserBook,
  type BookRow,
  type RecommendationRow,
  type SessionRow,
  type UserBookRow,
} from "@/lib/repository/supabaseRepository";
import { getSupabase, isServerMode } from "@/lib/supabase/client";
import { uploadDomainTables, type DomainTables } from "@/lib/supabase/migrateLocal";
import type {
  AiProfile,
  BookNote,
  BookQuote,
  PreferenceProfile,
  ReadingGoals,
  WrappedSummary,
} from "@/lib/types";

// 데이터 백업/복원 — 일회성 상태인 activeSession을 제외한 전 테이블을 JSON으로 내보내고 id 기준 병합 복원 (스펙 §82)
// Data backup/restore — exports every table except the transient activeSession, restores with id-based merge (spec §82)
// 로컬 모드는 Dexie, 서버 모드(로그인)는 Supabase를 대상으로 한다 — 파일 형식은 동일 (2차 B6 후속)
// Local mode targets Dexie; server mode targets Supabase — same file format (phase-2 B6 follow-up)
// 주의: 백업 유틸 성격상 Repository 경계 대신 저장소에 직접 접근한다
// Note: as a backup utility this bypasses the repository boundary

const EXPORT_VERSION = 1;

const TABLE_NAMES = [
  "books",
  "userBooks",
  "readingSessions",
  "preferences",
  "aiProfiles",
  "recommendations",
  "notes",
  "quotes",
  "goals",
  "wrapped",
] as const;

type TableName = (typeof TABLE_NAMES)[number];

interface ExportPayload {
  app: "rive";
  version: number;
  exportedAt: number;
  tables: Partial<Record<TableName, unknown[]>>;
}

// 서버(Supabase)의 내 데이터를 로컬 내보내기와 같은 도메인 형태로 수집한다
// Collects the user's server data in the same domain shape as local exports
async function collectServerTables(): Promise<ExportPayload["tables"]> {
  const supabase = getSupabase();
  const currentYear = new Date().getFullYear();

  const select = async <T>(table: string): Promise<T[]> => {
    const { data, error } = await supabase.from(table).select("*");
    if (error) {
      throw new Error(`[export] ${table}: ${error.message}`);
    }
    return (data ?? []) as T[];
  };

  const [books, userBooks, sessions, recommendations, notes, quotes, preferences, aiProfiles, goals, wrapped] =
    await Promise.all([
      select<BookRow>("books"),
      select<UserBookRow>("user_books"),
      select<SessionRow>("reading_sessions"),
      select<RecommendationRow>("recommendations"),
      select<{ id: string; book_id: string; content: string; created_at: number }>("notes"),
      select<{
        id: string;
        book_id: string;
        page: number;
        quote: string;
        comment: string;
        created_at: number;
      }>("quotes"),
      select<{
        favorite_genres: string[];
        disliked_genres: string[];
        loved_books: PreferenceProfile["lovedBooks"];
        disliked_books: PreferenceProfile["dislikedBooks"];
        fiction_preference: PreferenceProfile["fictionPreference"];
        reading_purposes: string[];
        age_range: string | null;
        gender: string | null;
        updated_at: number;
      }>("preferences"),
      select<{
        profile_type: string;
        summary: string;
        genres: AiProfile["genres"];
        traits: string[];
        recommendation_factors: string[];
        evidence: string[];
        taste_changes: string[] | null;
        dna: AiProfile["dna"] | null;
        book_twin: AiProfile["bookTwin"] | null;
        analyzed_at: number;
      }>("ai_profiles"),
      select<{
        year: number;
        target_books: number;
        target_pages: number;
        target_hours: number;
        updated_at: number;
      }>("goals"),
      select<{ period: string; summary: string; generated_at: number }>("wrapped"),
    ]);

  return {
    books: books.map(rowToBook),
    userBooks: userBooks.map(rowToUserBook),
    readingSessions: sessions.map(rowToSession),
    recommendations: recommendations.map(rowToRecommendation),
    notes: notes.map(
      (row): BookNote => ({
        id: row.id,
        bookId: row.book_id,
        content: row.content,
        createdAt: row.created_at,
      }),
    ),
    quotes: quotes.map(
      (row): BookQuote => ({
        id: row.id,
        bookId: row.book_id,
        page: row.page,
        quote: row.quote,
        comment: row.comment,
        createdAt: row.created_at,
      }),
    ),
    preferences: preferences.map(
      (row): PreferenceProfile => ({
        id: "primary",
        favoriteGenres: row.favorite_genres,
        dislikedGenres: row.disliked_genres,
        lovedBooks: row.loved_books,
        dislikedBooks: row.disliked_books,
        fictionPreference: row.fiction_preference,
        readingPurposes: row.reading_purposes,
        ...(row.age_range !== null ? { ageRange: row.age_range } : {}),
        ...(row.gender !== null ? { gender: row.gender } : {}),
        updatedAt: row.updated_at,
      }),
    ),
    aiProfiles: aiProfiles.map(
      (row): AiProfile => ({
        id: "current",
        profileType: row.profile_type,
        summary: row.summary,
        genres: row.genres,
        traits: row.traits,
        recommendationFactors: row.recommendation_factors,
        evidence: row.evidence,
        ...(row.taste_changes !== null ? { tasteChanges: row.taste_changes } : {}),
        ...(row.dna !== null ? { dna: row.dna } : {}),
        ...(row.book_twin !== null ? { bookTwin: row.book_twin } : {}),
        analyzedAt: row.analyzed_at,
      }),
    ),
    // 서버는 연도별 다중 행 — 올해 행만 "current"로, 과거 연도는 연도 문자열 id로 보존한다
    // Server keeps one row per year — this year maps to "current", past years keep year ids
    goals: goals.map(
      (row): ReadingGoals => ({
        id: row.year === currentYear ? "current" : (String(row.year) as ReadingGoals["id"]),
        year: row.year,
        targetBooks: row.target_books,
        targetPages: row.target_pages,
        targetHours: row.target_hours,
        updatedAt: row.updated_at,
      }),
    ),
    wrapped: wrapped.map(
      (row): WrappedSummary => ({
        id: row.period,
        summary: row.summary,
        generatedAt: row.generated_at,
      }),
    ),
  };
}

export async function exportAllData(): Promise<void> {
  let tables: ExportPayload["tables"];
  if (isServerMode()) {
    tables = await collectServerTables();
  } else {
    const db = getDb();
    tables = {};
    for (const name of TABLE_NAMES) {
      tables[name] = await db.table(name).toArray();
    }
  }
  const payload: ExportPayload = {
    app: "rive",
    version: EXPORT_VERSION,
    exportedAt: Date.now(),
    tables,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `rive-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export interface ImportResult {
  imported: number;
}

export async function importAllData(file: File): Promise<ImportResult> {
  const text = await file.text();
  const payload = JSON.parse(text) as ExportPayload;

  if (payload.app !== "rive" || typeof payload.version !== "number" || !payload.tables) {
    throw new Error("not a rive backup file");
  }

  // 앱보다 새 버전의 백업은 스키마를 알 수 없으므로 거부한다 (5차 조사 L15)
  // Reject backups newer than the app — their schema is unknown here (audit 5 L15)
  if (payload.version > EXPORT_VERSION) {
    throw new Error(`unsupported backup version: ${payload.version}`);
  }

  // 서버 모드는 계정으로 병합 복원 — 이관과 같은 업로더를 재사용한다 (RLS 보호)
  // Server mode merges into the account via the shared uploader (RLS-scoped)
  if (isServerMode()) {
    const result = await uploadDomainTables(payload.tables as DomainTables);
    notifyLibraryChange();
    return { imported: result.imported };
  }

  const db = getDb();
  let imported = 0;
  for (const name of TABLE_NAMES) {
    const rows = payload.tables[name];
    if (!Array.isArray(rows)) {
      continue;
    }
    // 객체가 아닌 행은 걸러낸다 — 손상 파일이 테이블을 오염시키지 않게 (7차 D7 로컬 경로)
    // Drop non-object rows so a corrupt file cannot pollute the table (audit 7 D7)
    const validRows = rows.filter((row) => typeof row === "object" && row !== null);
    if (validRows.length === 0) {
      continue;
    }
    // 동일 id는 백업 내용으로 덮어쓰고, 없는 항목은 추가한다 (병합 복원)
    // Same-id rows are overwritten by the backup; new rows are added (merge restore)
    await db.table(name).bulkPut(validRows);
    imported += validRows.length;
  }

  notifyLibraryChange();
  return { imported };
}
