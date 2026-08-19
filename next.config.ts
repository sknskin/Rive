import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 개발 모드 좌하단 인디케이터(N 배지) 숨김
  // Hide the dev-mode indicator badge (bottom-left N)
  devIndicators: false,
  images: {
    // 도서 표지는 Kakao/Google 등 다양한 CDN에서 오므로 https 전체를 허용한다
    // Book covers come from various CDNs (Kakao/Google), so allow any https host
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;
