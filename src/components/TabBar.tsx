"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 하단 탭 정의 — 1차에서는 Today/Calendar만 활성화한다
// Bottom tab definition — only Today/Calendar are enabled in phase 1
interface TabItem {
  href: string;
  label: string;
  enabled: boolean;
  icon: React.ReactNode;
}

const ICON_STROKE_WIDTH = 1.7;

function iconProps(active: boolean) {
  return {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: active ? ICON_STROKE_WIDTH + 0.5 : ICON_STROKE_WIDTH,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

const TABS: Omit<TabItem, "icon">[] = [
  { href: "/", label: "Today", enabled: true },
  { href: "/calendar", label: "Calendar", enabled: true },
  { href: "/library", label: "Library", enabled: true },
  { href: "/discover", label: "Discover", enabled: true },
  { href: "/insights", label: "Insights", enabled: true },
];

function TabIcon({ href, active }: { href: string; active: boolean }) {
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

export default function TabBar() {
  const pathname = usePathname();

  // Reading Mode는 몰입 화면이므로 탭바를 숨긴다
  // Reading Mode is immersive, so hide the tab bar there
  if (pathname.startsWith("/read")) {
    return null;
  }

  return (
    <nav
      aria-label="주요 메뉴"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-separator bg-elevated/80 backdrop-blur-xl"
    >
      <div className="pb-safe mx-auto flex w-full max-w-lg items-stretch">
        {TABS.map((tab) => {
          // 하위 경로(/library/[id] 등)에서도 해당 탭을 활성으로 표시한다
          // Keep the tab active on nested routes such as /library/[id]
          const active =
            tab.enabled &&
            (pathname === tab.href ||
              (tab.href !== "/" && pathname.startsWith(`${tab.href}/`)));

          if (!tab.enabled) {
            return (
              <div
                key={tab.href}
                aria-disabled="true"
                title="준비 중이에요"
                className="flex flex-1 cursor-default flex-col items-center gap-0.5 pt-2 pb-1.5 text-ink-tertiary/60"
              >
                <TabIcon href={tab.href} active={false} />
                <span className="text-[10px] font-medium">{tab.label}</span>
              </div>
            );
          }

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-1 flex-col items-center gap-0.5 pt-2 pb-1.5 transition-colors duration-200 ${
                active ? "text-ink" : "text-ink-tertiary"
              }`}
            >
              <TabIcon href={tab.href} active={active} />
              <span className={`text-[10px] ${active ? "font-semibold" : "font-medium"}`}>
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
