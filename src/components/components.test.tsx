// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// vitest는 전역 afterEach가 없어 RTL 자동 정리가 동작하지 않는다 — 명시 정리
// Vitest has no global afterEach, so RTL auto-cleanup is registered manually
afterEach(cleanup);
import BookCover from "@/components/BookCover";
import PageSkeleton from "@/components/PageSkeleton";
import HourBars from "@/components/insights/HourBars";
import WeekdayBars from "@/components/insights/WeekdayBars";
import RatingStars from "@/components/library/RatingStars";

// 핵심 컴포넌트 스모크 테스트 — 렌더 결과와 상호작용 계약을 검증한다
// Smoke tests for key components — rendering output and interaction contracts

describe("RatingStars", () => {
  it("별 5개를 라디오로 렌더하고 현재 값을 표시한다", () => {
    render(<RatingStars rating={3} onChange={() => {}} />);
    const stars = screen.getAllByRole("radio");
    expect(stars).toHaveLength(5);
    expect(screen.getByRole("radio", { name: "3점" })).toHaveAttribute("aria-checked", "true");
  });

  it("별을 탭하면 해당 값으로 onChange가 호출된다", () => {
    const onChange = vi.fn();
    render(<RatingStars rating={0} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "4점" }));
    expect(onChange).toHaveBeenCalledWith(4);
  });
});

describe("BookCover", () => {
  it("표지가 없으면 제목 기반 플레이스홀더를 렌더한다", () => {
    render(<BookCover title="총 균 쇠" coverUrl="" />);
    expect(screen.getByText("총 균 쇠")).toBeInTheDocument();
  });
});

describe("HourBars / WeekdayBars 빈 상태", () => {
  it("시간대 데이터가 전부 0이면 빈 문구를 보여준다", () => {
    render(<HourBars histogram={Array.from({ length: 24 }, () => 0)} peak={null} />);
    expect(screen.getByText("아직 시간대 데이터가 없어요")).toBeInTheDocument();
  });

  it("요일 데이터가 전부 0이면 빈 문구를 보여준다", () => {
    render(<WeekdayBars histogram={Array.from({ length: 7 }, () => 0)} />);
    expect(screen.getByText("아직 요일 데이터가 없어요")).toBeInTheDocument();
  });

  it("데이터가 있으면 차트 요약 라벨을 노출한다", () => {
    const histogram = Array.from({ length: 7 }, () => 0);
    histogram[2] = 3600;
    render(<WeekdayBars histogram={histogram} />);
    expect(
      screen.getByRole("img", { name: /가장 많이 읽은 요일은 화요일/ }),
    ).toBeInTheDocument();
  });
});

describe("PageSkeleton", () => {
  it("로딩 상태를 접근성 속성으로 알린다", () => {
    render(<PageSkeleton />);
    expect(screen.getByRole("main", { busy: true })).toBeInTheDocument();
  });
});
