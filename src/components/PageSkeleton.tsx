// 화면 로드 중 공용 스켈레톤 — 빈 화면 대신 레이아웃 힌트를 준다 (5차 조사 L12)
// Shared loading skeleton — hints at the layout instead of a blank screen (audit 5 L12)
export default function PageSkeleton() {
  return (
    <main
      aria-busy="true"
      aria-label="불러오는 중"
      className="flex-1 animate-pulse px-5 pt-8 pb-20"
    >
      <div className="h-4 w-24 rounded-md bg-fill" />
      <div className="mt-3 h-7 w-48 rounded-md bg-fill" />
      <div className="mt-10 flex items-center gap-5">
        <div className="h-28 w-20 rounded-lg bg-fill" />
        <div className="min-w-0 flex-1">
          <div className="h-5 w-3/5 rounded-md bg-fill" />
          <div className="mt-2 h-4 w-2/5 rounded-md bg-fill" />
        </div>
      </div>
      <div className="mt-10 h-14 w-full rounded-2xl bg-fill" />
    </main>
  );
}
