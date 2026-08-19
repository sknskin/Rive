// 테마 모드 관리 — 시스템 모드가 기본값 (스펙 §0-8)
// Theme mode management — system mode is the default (spec §0-8)

export type ThemeMode = "light" | "dark" | "system";

const THEME_STORAGE_KEY = "rive-theme";
export const DEFAULT_THEME: ThemeMode = "system";

export const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "라이트 모드" },
  { value: "dark", label: "다크 모드" },
  { value: "system", label: "시스템 설정" },
];

export function getStoredTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      return stored;
    }
    return DEFAULT_THEME;
  } catch (error) {
    // localStorage 접근이 막힌 환경(시크릿 모드 등)에서는 기본값을 쓴다
    // Fall back to the default when localStorage is unavailable (private mode, etc.)
    console.error("[theme] failed to read stored theme:", error);
    return DEFAULT_THEME;
  }
}

// 모드 변경을 구독자(아이콘 버튼 등)에게 알리는 커스텀 이벤트
// Custom event that notifies subscribers (icon button, etc.) of mode changes
const THEME_CHANGE_EVENT = "rive-theme-change";

export function applyTheme(mode: ThemeMode): void {
  try {
    if (mode === "system") {
      delete document.documentElement.dataset.theme;
      localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      document.documentElement.dataset.theme = mode;
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    }
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  } catch (error) {
    console.error("[theme] failed to apply theme:", error);
  }
}

export function subscribeThemeChange(callback: () => void): () => void {
  window.addEventListener(THEME_CHANGE_EVENT, callback);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, callback);
}

// 첫 페인트 전에 저장된 테마를 적용해 깜빡임을 막는 인라인 스크립트
// Inline script that applies the stored theme before first paint to avoid flashing
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;}}catch(e){}})();`;
