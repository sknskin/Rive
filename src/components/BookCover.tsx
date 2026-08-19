import Image from "next/image";

type CoverSize = "sm" | "md" | "lg" | "fluid";

// 표지 크기 사전 정의 — 2:3 비율 고정, fluid는 그리드 셀에 맞춰 늘어난다
// Predefined cover sizes — fixed 2:3 ratio; fluid stretches to its grid cell
const SIZE_CLASSES: Record<CoverSize, string> = {
  sm: "w-11",
  md: "w-20",
  lg: "w-32",
  fluid: "w-full",
};

const SIZE_PIXELS: Record<CoverSize, number> = {
  sm: 44,
  md: 80,
  lg: 128,
  fluid: 160,
};

interface BookCoverProps {
  title: string;
  coverUrl: string;
  size?: CoverSize;
}

// 표지가 없어도 디자인을 해치지 않는 타이포 기반 Placeholder (스펙 §62)
// Typography-based placeholder that keeps the design intact without a cover (spec §62)
function PlaceholderCover({ title }: { title: string }) {
  return (
    <div className="flex h-full w-full flex-col justify-between bg-fill p-[12%]">
      <span className="line-clamp-4 text-[0.6rem] leading-tight font-semibold break-keep text-ink-secondary">
        {title}
      </span>
      <span className="h-0.5 w-1/3 rounded-full bg-ink-tertiary" />
    </div>
  );
}

export default function BookCover({ title, coverUrl, size = "md" }: BookCoverProps) {
  return (
    <div
      className={`${SIZE_CLASSES[size]} relative aspect-2/3 shrink-0 overflow-hidden rounded-md shadow-sm ring-1 ring-separator`}
    >
      {coverUrl ? (
        <Image
          src={coverUrl}
          alt={`${title} 표지`}
          fill
          // fluid는 그리드 폭을 따르므로 뷰포트 기반 힌트를 준다 (모바일 3열 ≈ 33vw)
          // Fluid follows its grid cell, so hint by viewport (3-col mobile ≈ 33vw)
          sizes={
            size === "fluid" ? "(min-width: 1024px) 160px, 33vw" : `${SIZE_PIXELS[size]}px`
          }
          className="object-cover"
        />
      ) : (
        <PlaceholderCover title={title} />
      )}
    </div>
  );
}
