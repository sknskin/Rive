// 서재 변경 알림 — 전역 책 추가 후 열려 있는 화면들이 즉시 갱신되도록 한다
// Library-change notifications — lets mounted screens refresh after global book adds
// 같은 탭은 window 이벤트, 다른 탭은 BroadcastChannel로 전파한다 (Supabase 2차 B4)
// Same-tab via window events; other tabs via BroadcastChannel (Supabase phase 2, B4)

export const LIBRARY_CHANGE_EVENT = "rive-library-change";

// BroadcastChannel은 게시한 탭 자신에게는 전달되지 않으므로 이중 갱신이 없다
// BroadcastChannel never echoes to the posting tab, so no double refresh occurs
let broadcastChannel: BroadcastChannel | null = null;

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") {
    return null;
  }
  if (!broadcastChannel) {
    try {
      broadcastChannel = new BroadcastChannel(LIBRARY_CHANGE_EVENT);
    } catch (error) {
      console.error("[libraryEvents] failed to open broadcast channel:", error);
      return null;
    }
  }
  return broadcastChannel;
}

// 마지막 로컬 발행 시각 — Realtime이 자기 쓰기 에코를 걸러내는 데 쓴다 (7차 D6)
// Last local notify timestamp — lets Realtime skip echoes of our own writes (audit 7 D6)
let lastNotifyAtMs = 0;

export function getLastLibraryNotifyAt(): number {
  return lastNotifyAtMs;
}

export function notifyLibraryChange(): void {
  lastNotifyAtMs = Date.now();
  window.dispatchEvent(new Event(LIBRARY_CHANGE_EVENT));
  try {
    getBroadcastChannel()?.postMessage(LIBRARY_CHANGE_EVENT);
  } catch (error) {
    console.error("[libraryEvents] failed to broadcast:", error);
  }
}

export function subscribeLibraryChange(callback: () => void): () => void {
  window.addEventListener(LIBRARY_CHANGE_EVENT, callback);
  const channel = getBroadcastChannel();
  const handleMessage = () => callback();
  channel?.addEventListener("message", handleMessage);
  return () => {
    window.removeEventListener(LIBRARY_CHANGE_EVENT, callback);
    channel?.removeEventListener("message", handleMessage);
  };
}
