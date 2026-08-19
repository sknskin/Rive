import { createClient, type User } from "@supabase/supabase-js";

// AI 호출 일일 상한 — 인증 게이트 위의 2차 방어선 (rate limit 1차)
// Daily AI-call cap — second defense line on top of the auth gate
const AI_DAILY_LIMIT = 30;

export interface AuthedRequestUser {
  user: User;
  token: string;
}

function getEnv(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    console.error("[serverAuth] Supabase env vars missing");
    return null;
  }
  return { url, anonKey };
}

// AI 라우트 인증 게이트 — Bearer 토큰을 검증해 비용 어뷰징을 차단한다 (6차 조사 B1)
// Auth gate for AI routes — verifies the bearer token to block cost abuse (audit 6 B1)
export async function getUserFromRequest(request: Request): Promise<AuthedRequestUser | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!token) {
    return null;
  }

  const env = getEnv();
  if (!env) {
    return null;
  }

  try {
    const supabase = createClient(env.url, env.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      return null;
    }
    return { user: data.user, token };
  } catch (error) {
    console.error("[serverAuth] token verification failed:", error);
    return null;
  }
}

// 일일 AI 사용량 차감 — security definer RPC라 사용자가 카운터를 되돌릴 수 없다
// Consumes daily AI quota via a definer RPC users cannot reset
// 인프라 오류 시에는 막지 않는다(인증은 이미 통과) — 가용성 우선
// Fails open on infra errors (auth already passed) — availability first
export async function consumeDailyAiQuota(token: string): Promise<boolean> {
  const env = getEnv();
  if (!env) {
    return true;
  }
  try {
    const supabase = createClient(env.url, env.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data, error } = await supabase.rpc("consume_ai_quota", {
      p_daily_limit: AI_DAILY_LIMIT,
    });
    if (error) {
      console.error("[serverAuth] quota rpc failed:", error.message);
      return true;
    }
    return data === true;
  } catch (error) {
    console.error("[serverAuth] quota check failed:", error);
    return true;
  }
}
