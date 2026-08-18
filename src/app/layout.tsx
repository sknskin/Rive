import type { Metadata, Viewport } from "next";
import "./globals.css";
import TabBar from "@/components/TabBar";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Rive",
  description: "AI Personal Reading Calendar",
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
        <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
          {children}
        </div>
        <TabBar />
      </body>
    </html>
  );
}
