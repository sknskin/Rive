"use client";

import BottomSheet from "@/components/BottomSheet";
import { NOT_INTERESTED_REASONS } from "@/lib/constants";

interface NotInterestedSheetProps {
  open: boolean;
  onClose: () => void;
  onSelect: (reason: string) => void;
}

// 추천 거절 사유 선택 — Negative Preference 데이터로 활용 (스펙 §50)
// Not-interested reason picker — used as negative-preference data (spec §50)
export default function NotInterestedSheet({ open, onClose, onSelect }: NotInterestedSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} label="관심 없어요 이유">
      <div className="px-2">
        <h2 className="px-1 pt-2 text-lg font-semibold tracking-tight">
          어떤 점이 맞지 않았나요?
        </h2>
        <ul className="mt-3">
          {NOT_INTERESTED_REASONS.map((reason) => (
            <li key={reason}>
              <button
                type="button"
                onClick={() => onSelect(reason)}
                className="w-full cursor-pointer rounded-xl px-3 py-3.5 text-left text-[15px] font-medium active:bg-fill"
              >
                {reason}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </BottomSheet>
  );
}
