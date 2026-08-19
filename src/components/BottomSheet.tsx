"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useIsDesktop } from "@/lib/hooks/useIsDesktop";

const SPRING = { type: "spring", stiffness: 380, damping: 36 } as const;
const DIALOG_TRANSITION = { duration: 0.22, ease: "easeOut" } as const;

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

// 반응형 시트 — 모바일은 iOS Bottom Sheet, 데스크톱/태블릿은 중앙 다이얼로그 (스펙 §0-4)
// Responsive sheet — iOS bottom sheet on mobile, centered dialog on desktop/tablet (spec §0-4)
export default function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const isDesktop = useIsDesktop();

  // 시트가 열려 있는 동안 배경 스크롤을 잠근다
  // Lock background scroll while the sheet is open
  useEffect(() => {
    if (!open) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div
          className={`fixed inset-0 z-50 flex justify-center ${
            isDesktop ? "items-center" : "items-end"
          }`}
        >
          <motion.button
            aria-label="닫기"
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {isDesktop ? (
            <motion.div
              role="dialog"
              aria-modal="true"
              className="relative max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-elevated px-4 pt-4 pb-6 shadow-2xl ring-1 ring-separator"
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={DIALOG_TRANSITION}
            >
              {title && (
                <h2 className="px-2 pt-1 text-lg font-semibold tracking-tight">{title}</h2>
              )}
              {children}
            </motion.div>
          ) : (
            <motion.div
              role="dialog"
              aria-modal="true"
              className="relative w-full max-w-lg rounded-t-2xl bg-elevated shadow-2xl"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={SPRING}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(_, info) => {
                // 아래로 충분히 스와이프하면 닫는다
                // Close when swiped down far or fast enough
                if (info.offset.y > 120 || info.velocity.y > 800) {
                  onClose();
                }
              }}
            >
              <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-ink-tertiary/50" />
              {title && (
                <h2 className="px-6 pt-4 text-lg font-semibold tracking-tight">{title}</h2>
              )}
              {/* 하단 여백을 넉넉히 — 버튼이 바닥에 붙지 않도록 (safe area 추가 가산) */}
              {/* Generous bottom padding so buttons never sit flush with the edge */}
              <div className="pb-safe-10 max-h-[80dvh] overflow-y-auto px-4 pt-2">
                {children}
              </div>
            </motion.div>
          )}
        </div>
      )}
    </AnimatePresence>
  );
}
