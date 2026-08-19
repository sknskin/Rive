import { isServerMode } from "@/lib/supabase/client";
import { DexieRepository } from "./dexieRepository";
import { SupabaseRepository } from "./supabaseRepository";
import type { ReadingRepository } from "./types";

let localInstance: ReadingRepository | null = null;
let serverInstance: ReadingRepository | null = null;

// 저장소 진입점 — 로그인(서버 모드)이면 Supabase, 아니면 로컬 Dexie (설계 D1)
// Repository entry point — Supabase when signed in, local Dexie otherwise (design D1)
export function getRepository(): ReadingRepository {
  if (isServerMode()) {
    if (!serverInstance) {
      serverInstance = new SupabaseRepository();
    }
    return serverInstance;
  }
  if (!localInstance) {
    localInstance = new DexieRepository();
  }
  return localInstance;
}

export type { ReadingRepository } from "./types";
