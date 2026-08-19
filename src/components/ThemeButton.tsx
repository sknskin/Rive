"use client";

import { useThemeMode } from "@/lib/hooks/useThemeMode";
import { THEME_OPTIONS, type ThemeMode } from "@/lib/theme";

const ICON_PROPS = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

// 현재 모드에 따라 아이콘이 바뀐다 — 라이트: 해, 다크: 달, 시스템: 모니터 (lucide 스타일)
// Icon reflects the current mode — sun for light, moon for dark, monitor for system (lucide style)
function ModeIcon({ mode }: { mode: ThemeMode }) {
  if (mode === "light") {
    return (
      <svg {...ICON_PROPS}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </svg>
    );
  }
  if (mode === "dark") {
    return (
      <svg {...ICON_PROPS}>
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      </svg>
    );
  }
  return (
    <svg {...ICON_PROPS}>
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <line x1="8" x2="16" y1="21" y2="21" />
      <line x1="12" x2="12" y1="17" y2="21" />
    </svg>
  );
}

interface ThemeButtonProps {
  onClick: () => void;
}

export default function ThemeButton({ onClick }: ThemeButtonProps) {
  const mode = useThemeMode();
  const label = THEME_OPTIONS.find((option) => option.value === mode)?.label ?? "";

  return (
    <button
      type="button"
      aria-label={`화면 모드 설정 (현재: ${label})`}
      title={label}
      onClick={onClick}
      className="flex size-10 cursor-pointer items-center justify-center rounded-full text-ink-tertiary transition-colors duration-200 hover:bg-fill hover:text-ink active:bg-fill"
    >
      <ModeIcon mode={mode} />
    </button>
  );
}
