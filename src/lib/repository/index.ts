import { DexieRepository } from "./dexieRepository";
import type { ReadingRepository } from "./types";

let repositoryInstance: ReadingRepository | null = null;

// 저장소 싱글턴 — 이후 Supabase 구현으로 교체할 수 있는 유일한 진입점
// Repository singleton — the single entry point swappable for Supabase later
export function getRepository(): ReadingRepository {
  if (!repositoryInstance) {
    repositoryInstance = new DexieRepository();
  }
  return repositoryInstance;
}

export type { ReadingRepository } from "./types";
