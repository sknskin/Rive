"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import AddBookSheet from "@/components/AddBookSheet";
import ThemeButton from "@/components/ThemeButton";
import ThemeSheet from "@/components/ThemeSheet";

// 내비게이션 항목 — 데스크톱은 상단 탭, 모바일은 햄버거 드로어로 노출한다
// Navigation items — top tabs on desktop, hamburger drawer on mobile
interface NavItem {
  href: string;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Today" },
  { href: "/calendar", label: "Calendar" },
  { href: "/library", label: "Library" },
  { href: "/discover", label: "Discover" },
  { href: "/insights", label: "Insights" },
];

const ICON_STROKE_WIDTH = 1.7;
const DRAWER_SPRING = { type: "spring", stiffness: 400, damping: 38 } as const;

function iconProps(active: boolean) {
  return {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: active ? ICON_STROKE_WIDTH + 0.5 : ICON_STROKE_WIDTH,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}

function NavIcon({ href, active }: { href: string; active: boolean }) {
  switch (href) {
    case "/":
      return (
        <svg {...iconProps(active)}>
          <path d="M12 5.5C10.5 4 8.5 3.5 6 3.5c-1 0-2 .12-3 .4V19c1-.28 2-.4 3-.4 2.5 0 4.5.5 6 1.9 1.5-1.4 3.5-1.9 6-1.9 1 0 2 .12 3 .4V3.9c-1-.28-2-.4-3-.4-2.5 0-4.5.5-6 2z" />
          <path d="M12 5.5v15" />
        </svg>
      );
    case "/calendar":
      return (
        <svg {...iconProps(active)}>
          <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
          <path d="M3.5 9.5h17" />
          <path d="M8 2.8v3.4M16 2.8v3.4" />
        </svg>
      );
    case "/library":
      return (
        <svg {...iconProps(active)}>
          <path d="M5 4.5h2.5v15H5zM10.5 4.5H13v15h-2.5z" />
          <path d="m15.5 5.6 2.4-.6 3.4 14-2.4.6z" />
        </svg>
      );
    case "/discover":
      return (
        <svg {...iconProps(active)}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="m15.5 8.5-2 5-5 2 2-5z" />
        </svg>
      );
    case "/insights":
      return (
        <svg {...iconProps(active)}>
          <path d="M5 20V13M12 20V8M19 20V4" />
        </svg>
      );
    default:
      return null;
  }
}

function isNavActive(pathname: string, item: NavItem): boolean {
  // 하위 경로(/library/[id] 등)에서도 해당 항목을 활성으로 표시한다
  // Keep the item active on nested routes such as /library/[id]
  return pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
}

// 전역 책 추가 버튼 아이콘 (+)
// Global add-book button icon (+)
function PlusIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export default function TabBar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  // Reading Mode는 몰입 화면이므로 내비게이션을 숨긴다
  // Reading Mode is immersive, so hide navigation there
  if (pathname.startsWith("/read")) {
    return null;
  }

  function openThemeSheet() {
    // 드로어 위에 시트가 겹치지 않도록 먼저 닫는다
    // Close the drawer first so the sheet doesn't stack on top of it
    setMenuOpen(false);
    setThemeOpen(true);
  }

  return (
    <>
      {/* 데스크톱/태블릿: 상단 바 — 가운데 탭, 우측 끝 테마 아이콘 */}
      {/* Desktop/tablet: top bar — centered tabs, theme icon at the far right */}
      <nav
        aria-label="주요 메뉴"
        className="fixed inset-x-0 top-0 z-40 hidden border-b border-separator bg-elevated/80 backdrop-blur-xl md:block"
      >
        <div className="relative mx-auto flex h-12 w-full max-w-3xl items-center justify-center gap-1 px-4 lg:max-w-5xl">
          {NAV_ITEMS.map((item) => {
            const active = isNavActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] transition-colors duration-200 ${
                  active
                    ? "bg-fill font-semibold text-ink"
                    : "font-medium text-ink-tertiary hover:text-ink-secondary"
                }`}
              >
                <NavIcon href={item.href} active={active} />
                {item.label}
              </Link>
            );
          })}
          <div className="absolute right-2 flex items-center gap-0.5">
            <button
              type="button"
              aria-label="책 추가"
              title="책 추가"
              onClick={() => setAddOpen(true)}
              className="flex size-10 cursor-pointer items-center justify-center rounded-full text-ink-tertiary transition-colors duration-200 hover:bg-fill hover:text-ink active:bg-fill"
            >
              <PlusIcon />
            </button>
            <ThemeButton onClick={openThemeSheet} />
          </div>
        </div>
      </nav>

      {/* 모바일: 최상단 바 — 좌측 햄버거 + 워드마크 */}
      {/* Mobile: top bar — hamburger on the left plus wordmark */}
      <header className="fixed inset-x-0 top-0 z-40 border-b border-separator bg-elevated/80 backdrop-blur-xl md:hidden">
        <div className="flex h-12 items-center gap-1 px-2">
          <button
            type="button"
            aria-label="메뉴 열기"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
            className="flex size-10 cursor-pointer items-center justify-center rounded-full text-ink transition-colors duration-200 active:bg-fill"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M4 6.5h16M4 12h16M4 17.5h16" />
            </svg>
          </button>
          <span className="text-[17px] font-bold tracking-tight">Rive</span>
          <button
            type="button"
            aria-label="책 추가"
            onClick={() => setAddOpen(true)}
            className="ml-auto flex size-10 cursor-pointer items-center justify-center rounded-full text-ink transition-colors duration-200 active:bg-fill"
          >
            <PlusIcon />
          </button>
        </div>
      </header>

      {/* 모바일 드로어 메뉴 — 최하단에 테마 아이콘 */}
      {/* Mobile drawer menu — theme icon pinned at the bottom */}
      <AnimatePresence>
        {menuOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <motion.button
              aria-label="메뉴 닫기"
              className="absolute inset-0 bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
            />
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-label="메뉴"
              className="pb-safe-4 absolute inset-y-0 left-0 flex w-72 max-w-[80%] flex-col bg-elevated px-3 pt-5 shadow-2xl"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={DRAWER_SPRING}
            >
              <p className="px-3 text-xl font-bold tracking-tight">Rive</p>

              <ul className="mt-5 flex flex-col gap-0.5">
                {NAV_ITEMS.map((item) => {
                  const active = isNavActive(pathname, item);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setMenuOpen(false)}
                        className={`flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] transition-colors duration-150 ${
                          active
                            ? "bg-fill font-semibold text-ink"
                            : "font-medium text-ink-secondary active:bg-fill"
                        }`}
                      >
                        <NavIcon href={item.href} active={active} />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-auto flex items-center justify-between border-t border-separator px-1 pt-3">
                <span className="px-2 text-sm font-medium text-ink-tertiary">화면 모드</span>
                <ThemeButton onClick={openThemeSheet} />
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <ThemeSheet open={themeOpen} onClose={() => setThemeOpen(false)} />
      <AddBookSheet open={addOpen} onClose={() => setAddOpen(false)} />
    </>
  );
}
