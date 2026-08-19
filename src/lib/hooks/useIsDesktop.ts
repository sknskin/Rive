"use client";

import { useSyncExternalStore } from "react";

// Tailwind md 브레이크포인트와 동일한 기준 (768px)
// Matches Tailwind's md breakpoint (768px)
const DESKTOP_MEDIA_QUERY = "(min-width: 768px)";

function subscribe(callback: () => void): () => void {
  const media = window.matchMedia(DESKTOP_MEDIA_QUERY);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
  return window.matchMedia(DESKTOP_MEDIA_QUERY).matches;
}

// SSR에서는 모바일 우선(false)으로 가정한다
// Assume mobile-first (false) during SSR
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
