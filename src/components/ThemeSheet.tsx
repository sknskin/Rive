"use client";

import { useState } from "react";
import BottomSheet from "@/components/BottomSheet";
import { applyTheme, getStoredTheme, THEME_OPTIONS, type ThemeMode } from "@/lib/theme";

interface ThemeSheetProps {
  open: boolean;
  onClose: () => void;
}

// 테마 선택 Sheet — 라이트/다크/시스템, 기본값은 시스템
// Theme picker sheet — light/dark/system, defaulting to system
export default function ThemeSheet({ open, onClose }: ThemeSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose}>
      {/* 시트가 닫히면 내용이 언마운트되어 다음에 열 때 저장값을 새로 읽는다 */}
      {/* Content unmounts on close, so reopening reads the stored value fresh */}
      <ThemeSheetContent onClose={onClose} />
    </BottomSheet>
  );
}

function ThemeSheetContent({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<ThemeMode>(() => getStoredTheme());

  function handleSelect(next: ThemeMode) {
    applyTheme(next);
    setMode(next);
    onClose();
  }

  return (
    <div className="px-2">
      <h2 className="px-1 pt-2 text-lg font-semibold tracking-tight">화면 모드</h2>
      <ul className="mt-3">
        {THEME_OPTIONS.map((option) => (
          <li key={option.value}>
            <button
              type="button"
              onClick={() => handleSelect(option.value)}
              className="flex w-full items-center justify-between rounded-xl px-3 py-3.5 text-left text-[15px] font-medium active:bg-fill"
            >
              {option.label}
              {option.value === mode && <span className="text-tint">✓</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
