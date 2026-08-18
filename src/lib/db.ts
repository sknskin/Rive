import Dexie, { type EntityTable } from "dexie";
import type {
  ActiveSession,
  AiProfile,
  AiRecommendation,
  Book,
  PreferenceProfile,
  ReadingSession,
  UserBook,
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
  }
}

let dbInstance: RiveDatabase | null = null;

export function getDb(): RiveDatabase {
  if (!dbInstance) {
    dbInstance = new RiveDatabase();
  }
  return dbInstance;
}
