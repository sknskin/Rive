// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/components/AddBookSheet", () => ({ default: () => null }));
vi.mock("@/components/ThemeSheet", () => ({ default: () => null }));
vi.mock("@/components/ThemeButton", () => ({
  default: ({ onClick }: { onClick: () => void }) => (
    <button type="button" aria-label="테마 설정" onClick={onClick}>
      테마
    </button>
  ),
}));
vi.mock("@/lib/hooks/useIsDesktop", () => ({ useIsDesktop: () => false }));

import TabBar from "@/components/TabBar";
import BookSearch from "@/components/read/BookSearch";
import EndPageSheet from "@/components/read/EndPageSheet";
import StartPageConfirm from "@/components/read/StartPageConfirm";

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

describe("모바일 메뉴 접근성", () => {
  it("포커스를 가두고 Escape로 닫은 뒤 트리거에 복귀한다", async () => {
    render(<TabBar />);
    const trigger = screen.getByRole("button", { name: "메뉴 열기" });
    trigger.focus();
    fireEvent.click(trigger);

    const drawer = screen.getByRole("dialog", { name: "메뉴" });
    const firstLink = within(drawer).getByRole("link", { name: "Today" });
    await waitFor(() => expect(firstLink).toHaveFocus());
    expect(document.body.style.overflow).toBe("hidden");

    const lastButton = within(drawer).getByRole("button", { name: "테마 설정" });
    lastButton.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(firstLink).toHaveFocus();

    firstLink.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(lastButton).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "메뉴" })).toBeNull());
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });
});

describe("독서 입력 접근성", () => {
  it("시작 페이지 수정 입력에 이름이 있다", () => {
    render(
      <StartPageConfirm
        title="테스트 책"
        authors={[]}
        coverUrl=""
        suggestedPage={12}
        starting={false}
        onStart={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "수정" }));
    expect(screen.getByRole("spinbutton", { name: "시작 페이지" })).toBeInTheDocument();
  });

  it("종료 시트의 메모 입력과 오류를 보조기기에 노출한다", () => {
    render(
      <EndPageSheet
        open
        onClose={() => {}}
        durationSeconds={60}
        startPage={10}
        pageCount={100}
        saving={false}
        saveError="저장하지 못했어요"
        onSave={() => {}}
        onDiscard={() => {}}
      />,
    );
    expect(screen.getByRole("textbox", { name: "독서 메모" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("저장하지 못했어요");
  });

  it("검색 진행 상태를 live region으로 알린다", () => {
    render(<BookSearch onSelect={() => {}} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "책 제목이나 저자 검색" }), {
      target: { value: "채식주의자" },
    });
    expect(screen.getByRole("status")).toHaveTextContent("검색 중…");
  });
});
