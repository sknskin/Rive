// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BookSearch from "./BookSearch";

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function searchBody(title: string) {
  return {
    results: [{
      title,
      authors: ["작가"],
      publisher: "출판사",
      isbn13: title,
      coverUrl: "",
      pageCount: 100,
      kakaoUrl: "",
      googleBooksId: title,
    }],
    source: "google",
  };
}

describe("BookSearch request lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("renders only the newest response when an older request resolves last", async () => {
    const first = deferredResponse();
    const second = deferredResponse();
    const fetchMock = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    vi.stubGlobal("fetch", fetchMock);
    render(<BookSearch onSelect={() => {}} />);
    const input = screen.getByRole("searchbox", { name: "책 제목이나 저자 검색" });

    fireEvent.change(input, { target: { value: "이전 검색" } });
    await act(async () => vi.advanceTimersByTimeAsync(300));
    fireEvent.change(input, { target: { value: "최신 검색" } });
    await act(async () => vi.advanceTimersByTimeAsync(300));

    const firstSignal = (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.signal;
    expect(firstSignal?.aborted).toBe(true);

    await act(async () => {
      second.resolve(Response.json(searchBody("최신 결과")));
      await second.promise;
    });
    await act(async () => {
      first.resolve(Response.json(searchBody("뒤늦은 이전 결과")));
      await first.promise;
    });

    expect(screen.getAllByText("최신 결과").length).toBeGreaterThan(0);
    expect(screen.queryByText("뒤늦은 이전 결과")).toBeNull();
  });

  it("does not start a debounced request after unmount", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<BookSearch onSelect={() => {}} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "책 제목이나 저자 검색" }), {
      target: { value: "사라질 검색" },
    });

    view.unmount();
    await act(async () => vi.advanceTimersByTimeAsync(300));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
