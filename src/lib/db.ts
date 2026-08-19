import Dexie, { type EntityTable } from "dexie";
import type {
  ActiveSession,
  AiProfile,
  AiRecommendation,
  Book,
  BookNote,
  BookQuote,
  PreferenceProfile,
  ReadingGoals,
  ReadingSession,
  UserBook,
  WrappedSummary,
} from "@/lib/types";
import { DB_NAME } from "@/lib/constants";

// Dexie(IndexedDB) 스키마 정의 — 로컬 우선 저장소
// Dexie (IndexedDB) schema definition — local-first storage
export class RiveDatabase extends Dexie {
  books!: EntityTable<Book, "id">;
  userBooks!: EntityTable<UserBook, "bookId">;
  readingSessions!: EntityTable<ReadingSession, "id">;
  activeSession!: EntityTable<ActiveSession, "id">;
  preferences!: EntityTable<PreferenceProfile, "id">;
  aiProfiles!: EntityTable<AiProfile, "id">;
  recommendations!: EntityTable<AiRecommendation, "id">;
  notes!: EntityTable<BookNote, "id">;
  quotes!: EntityTable<BookQuote, "id">;
  goals!: EntityTable<ReadingGoals, "id">;
  wrapped!: EntityTable<WrappedSummary, "id">;

  constructor() {
    super(DB_NAME);
    this.version(1).stores({
      books: "id, isbn13",
      userBooks: "bookId, status, lastReadAt",
      readingSessions: "id, bookId, startedAt",
      activeSession: "id",
    });
    // v2: AI 취향 분석/추천 캐시 테이블 추가 (기존 테이블 변경 없음)
    // v2: adds AI preference/recommendation cache tables (existing tables untouched)
    this.version(2).stores({
      preferences: "id",
      aiProfiles: "id",
      recommendations: "id, status, generatedAt",
    });
    // v3: 노트/인용구, 연간 목표, 리캡 캐시 (기존 테이블 변경 없음)
    // v3: notes/quotes, annual goals, wrapped cache (existing tables untouched)
    this.version(3).stores({
      notes: "id, bookId",
      quotes: "id, bookId",
      goals: "id",
      wrapped: "id",
    });
  }
}

let dbInstance: RiveDatabase | null = null;

export function getDb(): RiveDatabase {
  if (!dbInstance) {
    dbInstance = new RiveDatabase();
    // 브라우저에 영구 스토리지를 요청한다 — 저장 공간 정리 시 IndexedDB가 지워지는 것을 방지
    // (거부돼도 동작에는 영향 없음, 최선 노력)
    // Ask the browser for persistent storage so cleanup won't evict IndexedDB
    // (best effort — a denial does not affect functionality)
    if (typeof navigator !== "undefined" && navigator.storage?.persist) {
      navigator.storage.persist().catch((error) => {
        console.error("[db] persistent storage request failed:", error);
      });
    }
  }
  return dbInstance;
}
