"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useIsDesktop } from "@/lib/hooks/useIsDesktop";

const SPRING = { type: "spring", stiffness: 380, damping: 36 } as const;
const DIALOG_TRANSITION = { duration: 0.22, ease: "easeOut" } as const;

// 포커스 트랩 대상 — 시트 내에서 Tab 이동이 가능한 요소들
// Focus-trap targets — elements tabbable inside the sheet
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  // 스크린 리더용 시트 이름 — 시각적 제목은 각 시트 콘텐츠가 자체 렌더한다
  // Accessible sheet name — visual titles are rendered by each sheet's own content
  label?: string;
  children: React.ReactNode;
}

// 반응형 시트 — 모바일은 iOS Bottom Sheet, 데스크톱/태블릿은 중앙 다이얼로그 (스펙 §0-4)
// Responsive sheet — iOS bottom sheet on mobile, centered dialog on desktop/tablet (spec §0-4)
export default function BottomSheet({ open, onClose, title, label, children }: BottomSheetProps) {
  const isDesktop = useIsDesktop();
  const panelRef = useRef<HTMLDivElement>(null);

  // onClose를 ref로 유지해 포커스/키보드 이펙트가 렌더마다 재실행되지 않게 한다
  // Keep onClose in a ref so the focus/keyboard effect doesn't re-run every render
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

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

  // Escape로 닫기 + 열릴 때 시트로 포커스 이동, 닫히면 이전 위치로 복귀
  // Close on Escape; move focus into the sheet on open and restore it on close
  useEffect(() => {
    if (!open) {
      return;
    }
    const previousFocus = document.activeElement as HTMLElement | null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      // Tab 순환을 시트 안에 가둔다 — 배경 콘텐츠로 포커스가 새지 않게 (포커스 트랩)
      // Trap Tab cycling inside the sheet so focus never leaks to the background
      if (event.key === "Tab") {
        const panel = panelRef.current;
        if (!panel) {
          return;
        }
        const focusables = panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (focusables.length === 0) {
          event.preventDefault();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (!panel.contains(active)) {
          event.preventDefault();
          first.focus();
        } else if (event.shiftKey && (active === first || active === panel)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    // 시트 내부에 autoFocus 입력이 없을 때만 패널 자체로 포커스를 옮긴다
    // Focus the panel only when no autoFocus input inside claimed focus first
    const focusTimer = setTimeout(() => {
      const panel = panelRef.current;
      if (panel && !panel.contains(document.activeElement)) {
        panel.focus();
      }
    }, 0);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      clearTimeout(focusTimer);
      previousFocus?.focus?.();
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
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label={label}
              tabIndex={-1}
              className="relative max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-elevated px-4 pt-4 pb-6 shadow-2xl ring-1 ring-separator outline-none"
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
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label={label}
              tabIndex={-1}
              className="relative w-full max-w-lg rounded-t-2xl bg-elevated shadow-2xl outline-none"
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
