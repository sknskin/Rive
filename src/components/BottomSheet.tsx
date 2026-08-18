"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";

const SPRING = { type: "spring", stiffness: 380, damping: 36 } as const;

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

// iOS Bottom Sheet 스타일 공용 컴포넌트 (스펙 §0-4)
// Shared iOS-style bottom sheet component (spec §0-4)
export default function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
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
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <motion.button
            aria-label="닫기"
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-lg rounded-t-2xl bg-elevated shadow-2xl md:mb-6 md:rounded-2xl"
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
            <div className="pb-safe max-h-[80dvh] overflow-y-auto px-4 pt-2 pb-6">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
