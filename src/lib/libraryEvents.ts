// 서재 변경 알림 — 전역 책 추가 후 열려 있는 화면들이 즉시 갱신되도록 한다
// Library-change notifications — lets mounted screens refresh after global book adds

export const LIBRARY_CHANGE_EVENT = "rive-library-change";

export function notifyLibraryChange(): void {
  window.dispatchEvent(new Event(LIBRARY_CHANGE_EVENT));
}

export function subscribeLibraryChange(callback: () => void): () => void {
  window.addEventListener(LIBRARY_CHANGE_EVENT, callback);
  return () => window.removeEventListener(LIBRARY_CHANGE_EVENT, callback);
}
