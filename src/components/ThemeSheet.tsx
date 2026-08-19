"use client";

import { useRef, useState } from "react";
import AccountSection from "@/components/AccountSection";
import BottomSheet from "@/components/BottomSheet";
import { exportAllData, importAllData } from "@/lib/dataTransfer";
import { isServerMode } from "@/lib/supabase/client";
import { applyTheme, getStoredTheme, THEME_OPTIONS, type ThemeMode } from "@/lib/theme";

interface ThemeSheetProps {
  open: boolean;
  onClose: () => void;
}

// 설정 시트 — 화면 모드 + 데이터 백업/복원 (스펙 §0-8, §82 Import/Export)
// Settings sheet — theme mode plus data backup/restore (spec §0-8, §82)
export default function ThemeSheet({ open, onClose }: ThemeSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} label="설정">
      {/* 시트가 닫히면 내용이 언마운트되어 다음에 열 때 저장값을 새로 읽는다 */}
      {/* Content unmounts on close, so reopening reads the stored value fresh */}
      <ThemeSheetContent onClose={onClose} />
    </BottomSheet>
  );
}

function ThemeSheetContent({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<ThemeMode>(() => getStoredTheme());
  const [dataMessage, setDataMessage] = useState("");
  const [dataError, setDataError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleSelect(next: ThemeMode) {
    applyTheme(next);
    setMode(next);
    onClose();
  }

  async function handleExport() {
    setBusy(true);
    setDataError("");
    try {
      await exportAllData();
      setDataMessage("백업 파일을 내려받았어요");
    } catch (error) {
      console.error("[Settings] export failed:", error);
      setDataError("내보내기에 실패했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function handleImportFile(file: File) {
    setBusy(true);
    setDataError("");
    try {
      const result = await importAllData(file);
      setDataMessage(`${result.imported.toLocaleString()}개 항목을 불러왔어요`);
    } catch (error) {
      console.error("[Settings] import failed:", error);
      setDataError("가져오지 못했어요. Rive 백업 파일인지 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    // 시트 내부 스크롤이 생기지 않도록 섹션 라벨·간격을 압축한 세로 구성 (사용자 요청)
    // Compact vertical layout so the sheet never needs internal scrolling
    <div className="px-2">
      <h2 className="px-1 pt-1 text-xs font-semibold tracking-wide text-ink-tertiary uppercase">
        계정
      </h2>
      <AccountSection />

      <h2 className="mt-4 border-t border-separator px-1 pt-3 text-xs font-semibold tracking-wide text-ink-tertiary uppercase">
        화면 모드
      </h2>
      {/* 3행 목록 대신 가로 세그먼트 — 세로 공간 절약 */}
      {/* Horizontal segmented control instead of three rows — saves height */}
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {THEME_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === mode}
            onClick={() => handleSelect(option.value)}
            className={`cursor-pointer rounded-xl px-2 py-2.5 text-[13px] font-medium transition-colors duration-150 ${
              option.value === mode
                ? "bg-accent text-accent-ink"
                : "bg-fill text-ink-secondary"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <h2 className="mt-4 border-t border-separator px-1 pt-3 text-xs font-semibold tracking-wide text-ink-tertiary uppercase">
        데이터
      </h2>
      {/* 백업 대상을 명시해 혼동을 막는다 — 서버 모드는 계정 기록 대상 (2차 B6) */}
      {/* Clarify the backup target — server mode operates on account records (B6) */}
      {isServerMode() && (
        <p className="mt-1 px-1 text-[11px] leading-relaxed text-ink-tertiary">
          계정에 저장된 기록을 파일로 내보내고, 파일을 계정으로 가져와요.
        </p>
      )}
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleExport()}
          className="cursor-pointer rounded-xl bg-fill px-2 py-2.5 text-[13px] font-medium text-ink-secondary active:opacity-70 disabled:opacity-40"
        >
          내보내기 (JSON)
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
          className="cursor-pointer rounded-xl bg-fill px-2 py-2.5 text-[13px] font-medium text-ink-secondary active:opacity-70 disabled:opacity-40"
        >
          가져오기
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void handleImportFile(file);
            }
            event.target.value = "";
          }}
        />
      </div>

      {dataMessage !== "" && (
        <p className="mt-2 px-1 text-sm text-tint">{dataMessage}</p>
      )}
      {dataError !== "" && <p className="mt-2 px-1 text-sm text-danger">{dataError}</p>}
    </div>
  );
}
