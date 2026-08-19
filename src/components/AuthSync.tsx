"use client";

import { useEffect } from "react";
import { notifyLibraryChange } from "@/lib/libraryEvents";
import { getSupabase, isServerMode, setServerMode } from "@/lib/supabase/client";

// 세션과 저장 모드 플래그를 정합시키는 전역 컴포넌트 (렌더 없음)
// Global renderless component keeping the session and storage-mode flag in sync
// - Google OAuth 리다이렉트 복귀 시 세션을 감지해 서버 모드로 전환한다 (설계 B3)
// - 세션이 만료/소멸했는데 플래그만 남아 있으면 로컬 모드로 복구한다
// - 서버 모드에서 창에 복귀하면 재조회 신호를 보내 다기기 변경을 반영한다 (설계 B4)
export default function AuthSync() {
  useEffect(() => {
    let cancelled = false;

    async function syncAuthMode() {
      try {
        const { data } = await getSupabase().auth.getSession();
        if (cancelled) {
          return;
        }
        const hasSession = data.session !== null;
        if (hasSession && !isServerMode()) {
          // OAuth 복귀 직후 등 — 플래그를 세우고 서버 모드로 다시 그린다
          // Right after an OAuth return etc. — set the flag and repaint in server mode
          setServerMode(true);
          window.location.reload();
          return;
        }
        if (!hasSession && isServerMode()) {
          setServerMode(false);
          window.location.reload();
        }
      } catch (error) {
        console.error("[AuthSync] session check failed:", error);
      }
    }

    void syncAuthMode();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // 다른 기기에서 기록했을 수 있으므로, 서버 모드에서 창 복귀 시 화면 재조회를 유도한다
    // Another device may have written data — nudge refetch when the tab becomes visible
    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && isServerMode()) {
        notifyLibraryChange();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  return null;
}
