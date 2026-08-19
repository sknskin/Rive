"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_THEME,
  getStoredTheme,
  subscribeThemeChange,
  type ThemeMode,
} from "@/lib/theme";

// 현재 테마 모드를 구독 — SSR에서는 기본값(system)을 사용한다
// Subscribe to the current theme mode — SSR falls back to the default (system)
export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribeThemeChange, getStoredTheme, () => DEFAULT_THEME);
}
