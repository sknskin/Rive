// @vitest-environment jsdom
import { useContext } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MotionConfigContext } from "motion/react";
import MotionProvider from "@/components/MotionProvider";

afterEach(cleanup);

function ReducedMotionProbe() {
  const config = useContext(MotionConfigContext);
  return <p>{config.reducedMotion}</p>;
}

describe("MotionProvider", () => {
  it("운영 motion 트리에 사용자 움직임 감소 설정을 전달한다", () => {
    render(
      <MotionProvider>
        <ReducedMotionProbe />
      </MotionProvider>,
    );

    expect(screen.getByText("user")).toBeInTheDocument();
  });
});
