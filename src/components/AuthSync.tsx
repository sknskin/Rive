"use client";

import { useEffect } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { LIBRARY_CHANGE_EVENT, notifyLibraryChange } from "@/lib/libraryEvents";
import { getSupabase, isServerMode, setServerMode } from "@/lib/supabase/client";

// Realtime으로 감시할 사용자 데이터 테이블 (마이그레이션 v2에서 발행 등록됨)
// User tables watched via Realtime (published in migration v2)
const REALTIME_TABLES = [
  "books",
  "user_books",
  "reading_sessions",
  "active_sessions",
  "notes",
  "quotes",
  "recommendations",
  "goals",
  "wrapped",
] as const;

// 한 조작이 여러 테이블 이벤트를 만들므로 짧게 모아 1회만 갱신한다
// One action emits several table events, so debounce into a single refresh
const REALTIME_DEBOUNCE_MS = 400;

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

  useEffect(() => {
    // 서버 모드에서 내 행 변경을 Realtime으로 구독 — 다기기 변경이 즉시 반영된다 (B4 후속)
    // Subscribe to own-row changes in server mode — instant multi-device sync (B4 follow-up)
    if (!isServerMode()) {
      return;
    }
    const client = getSupabase();
    let channel: RealtimeChannel | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const handleChange = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        // 각 탭이 자체 구독을 가지므로 이 탭만 갱신한다(브로드캐스트 중복 방지)
        // Every tab has its own subscription, so refresh only this tab
        window.dispatchEvent(new Event(LIBRARY_CHANGE_EVENT));
      }, REALTIME_DEBOUNCE_MS);
    };

    async function subscribe() {
      try {
        const { data } = await client.auth.getUser();
        const userId = data.user?.id;
        if (!userId || cancelled) {
          return;
        }
        channel = client.channel("rive-user-changes");
        for (const table of REALTIME_TABLES) {
          channel.on(
            "postgres_changes",
            { event: "*", schema: "public", table, filter: `user_id=eq.${userId}` },
            handleChange,
          );
        }
        channel.subscribe();
      } catch (error) {
        console.error("[AuthSync] realtime subscribe failed:", error);
      }
    }

    void subscribe();
    return () => {
      cancelled = true;
      clearTimeout(debounceTimer);
      if (channel) {
        void client.removeChannel(channel);
      }
    };
  }, []);

  return null;
}
