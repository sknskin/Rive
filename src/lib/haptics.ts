// 주요 동작에 대한 가벼운 햅틱 피드백 — 지원 기기(주로 Android)에서만 동작 (스펙 §0-6)
// Light haptic feedback for key actions — active only on supporting devices (spec §0-6)

const TAP_PATTERN_MS = 10;
const SUCCESS_PATTERN_MS = [15, 40, 15];

function vibrate(pattern: number | number[]): void {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  } catch (error) {
    // 진동 실패는 UX에 영향이 없으므로 로그만 남긴다
    // Vibration failures don't affect UX; just log them
    console.error("[haptics] vibrate failed:", error);
  }
}

export function hapticTap(): void {
  vibrate(TAP_PATTERN_MS);
}

export function hapticSuccess(): void {
  vibrate(SUCCESS_PATTERN_MS);
}
