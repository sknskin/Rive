import type { Metadata, Viewport } from "next";
import "./globals.css";
import AuthSync from "@/components/AuthSync";
import TabBar from "@/components/TabBar";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Rive",
  description: "AI Personal Reading Calendar",
  // PWA — 홈 화면 설치 지원 (리서치 C2)
  // PWA — home-screen installability (research C2)
  manifest: "/manifest.webmanifest",
  icons: { apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Rive", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f8" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        {/* 저장된 테마를 첫 페인트 전에 적용 (FOUC 방지) */}
        {/* Apply the stored theme before first paint (prevents flashing) */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/* 데스크톱/태블릿에서는 상단 바 높이만큼 여백을 준다 */}
        {/* Reserve space for the top bar on desktop/tablet */}
        {/* 콘텐츠 폭: 모바일 512px → 태블릿 672px → 데스크톱 1024px(2단 레이아웃), 상단 바 높이만큼 여백 */}
        {/* Content width: 512px mobile → 672px tablet → 1024px desktop (two-column), offset by top bar */}
        <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col pt-12 md:max-w-2xl lg:max-w-5xl">
          {children}
        </div>
        <TabBar />
        {/* 세션-저장모드 정합 + 창 복귀 재조회 (렌더 없음) */}
        {/* Session/storage-mode sync and visibility refetch (renderless) */}
        <AuthSync />
      </body>
    </html>
  );
}
