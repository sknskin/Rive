import { createClient, type User } from "@supabase/supabase-js";

// AI 라우트 인증 게이트 — Bearer 토큰을 검증해 비용 어뷰징을 차단한다 (6차 조사 B1)
// Auth gate for AI routes — verifies the bearer token to block cost abuse (audit 6 B1)
export async function getUserFromRequest(request: Request): Promise<User | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!token) {
    return null;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    console.error("[serverAuth] Supabase env vars missing");
    return null;
  }

  try {
    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      return null;
    }
    return data.user;
  } catch (error) {
    console.error("[serverAuth] token verification failed:", error);
    return null;
  }
}
