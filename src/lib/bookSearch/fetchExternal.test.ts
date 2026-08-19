import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchExternal } from "./fetchExternal";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("fetchExternal", () => {
  it("adds an abort signal when the caller does not provide one", async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await fetchExternal("https://example.com/books");

    expect(timeout).toHaveBeenCalledWith(8_000);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/books",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
