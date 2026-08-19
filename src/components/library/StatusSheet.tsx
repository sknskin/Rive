"use client";

import { useState } from "react";
import BottomSheet from "@/components/BottomSheet";
import { DNF_REASONS, STATUS_LABELS, STATUS_ORDER } from "@/lib/constants";
import type { BookStatus } from "@/lib/types";

interface StatusSheetProps {
  open: boolean;
  currentStatus: BookStatus;
  onClose: () => void;
  onSelect: (status: BookStatus, dnfReason?: string) => void;
}

// 상태 변경 Sheet — DNF 선택 시 사유를 이어서 묻는다 (스펙 §26)
// Status-change sheet — asks for a reason when DNF is chosen (spec §26)
export default function StatusSheet({ open, currentStatus, onClose, onSelect }: StatusSheetProps) {
  const [askingDnfReason, setAskingDnfReason] = useState(false);

  function handleClose() {
    setAskingDnfReason(false);
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={handleClose} label="상태 변경">
      {!askingDnfReason ? (
        <div className="px-2">
          <h2 className="px-1 pt-2 text-lg font-semibold tracking-tight">상태 변경</h2>
          <ul className="mt-3">
            {STATUS_ORDER.map((status) => (
              <li key={status}>
                <button
                  type="button"
                  onClick={() => {
                    if (status === "dnf") {
                      setAskingDnfReason(true);
                      return;
                    }
                    setAskingDnfReason(false);
                    onSelect(status);
                  }}
                  aria-pressed={status === currentStatus}
                  className="flex w-full cursor-pointer items-center justify-between rounded-xl px-3 py-3.5 text-left text-[15px] font-medium active:bg-fill"
                >
                  {STATUS_LABELS[status]}
                  {status === currentStatus && <span className="text-tint">✓</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="px-2">
          <h2 className="px-1 pt-2 text-lg font-semibold tracking-tight">
            어떤 이유로 중단했나요?
          </h2>
          <ul className="mt-3">
            {DNF_REASONS.map((reason) => (
              <li key={reason}>
                <button
                  type="button"
                  onClick={() => {
                    setAskingDnfReason(false);
                    onSelect("dnf", reason);
                  }}
                  className="w-full cursor-pointer rounded-xl px-3 py-3.5 text-left text-[15px] font-medium active:bg-fill"
                >
                  {reason}
                </button>
              </li>
            ))}
          </ul>
          {/* 실수로 중단을 눌렀을 때의 복귀 경로 (5차 조사 M4) */}
          {/* Way back for users who tapped DNF by mistake (audit 5 M4) */}
          <button
            type="button"
            onClick={() => setAskingDnfReason(false)}
            className="mt-2 w-full cursor-pointer py-2 text-center text-sm font-medium text-ink-tertiary transition-colors duration-150 hover:text-ink active:opacity-70"
          >
            뒤로
          </button>
        </div>
      )}
    </BottomSheet>
  );
}
