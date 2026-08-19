import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// 저장 모드 플래그 — getRepository()가 렌더 경로에서 동기적으로 분기해야 해서
// 세션 비동기 조회 대신 로그인/로그아웃 시점에 기록하는 localStorage 플래그를 쓴다
// Storage-mode flag — getRepository() must branch synchronously, so we persist
// a flag at sign-in/out instead of awaiting the session in render paths
const AUTH_MODE_STORAGE_KEY = "rive-auth-mode";
const AUTH_MODE_SUPABASE = "supabase";

let clientInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!clientInstance) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      throw new Error(
        "Supabase 환경변수가 없어요 (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)",
      );
    }
    clientInstance = createBrowserClient(url, anonKey);
  }
  return clientInstance;
}

// 서버 저장 모드 여부 — 로그인 상태에서만 true (설계 D1: 로그인 선택제)
// Whether server-storage mode is on — true only while signed in (design D1)
export function isServerMode(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(AUTH_MODE_STORAGE_KEY) === AUTH_MODE_SUPABASE;
  } catch (error) {
    console.error("[supabase] failed to read auth mode:", error);
    return false;
  }
}

export function setServerMode(enabled: boolean): void {
  try {
    if (enabled) {
      window.localStorage.setItem(AUTH_MODE_STORAGE_KEY, AUTH_MODE_SUPABASE);
    } else {
      window.localStorage.removeItem(AUTH_MODE_STORAGE_KEY);
    }
  } catch (error) {
    console.error("[supabase] failed to write auth mode:", error);
  }
}

// AI 라우트 인증 헤더 — 로그인 상태면 액세스 토큰을 붙인다
// Auth header for AI routes — attaches the access token when signed in
export async function getAuthHeader(): Promise<Record<string, string>> {
  if (!isServerMode()) {
    return {};
  }
  try {
    const { data } = await getSupabase().auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch (error) {
    console.error("[supabase] failed to read session:", error);
    return {};
  }
}
