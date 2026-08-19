"use client";

import { useRef, useState } from "react";
import BottomSheet from "@/components/BottomSheet";
import { exportAllData, importAllData } from "@/lib/dataTransfer";
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
    <div className="px-2">
      <h2 className="px-1 pt-2 text-lg font-semibold tracking-tight">화면 모드</h2>
      <ul className="mt-3">
        {THEME_OPTIONS.map((option) => (
          <li key={option.value}>
            <button
              type="button"
              onClick={() => handleSelect(option.value)}
              className="flex w-full cursor-pointer items-center justify-between rounded-xl px-3 py-3.5 text-left text-[15px] font-medium active:bg-fill"
            >
              {option.label}
              {option.value === mode && <span className="text-tint">✓</span>}
            </button>
          </li>
        ))}
      </ul>

      <h2 className="mt-4 border-t border-separator px-1 pt-4 text-lg font-semibold tracking-tight">
        데이터
      </h2>
      <div className="mt-3 flex flex-col gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleExport()}
          className="w-full cursor-pointer rounded-xl px-3 py-3.5 text-left text-[15px] font-medium active:bg-fill disabled:opacity-40"
        >
          데이터 내보내기 (JSON)
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
          className="w-full cursor-pointer rounded-xl px-3 py-3.5 text-left text-[15px] font-medium active:bg-fill disabled:opacity-40"
        >
          데이터 가져오기
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
