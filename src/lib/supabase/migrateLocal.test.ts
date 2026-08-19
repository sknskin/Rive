import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "@/lib/supabase/client";
import { uploadDomainTables } from "@/lib/supabase/migrateLocal";
import type { UserBook } from "@/lib/types";

vi.mock("@/lib/supabase/client", () => ({ getSupabase: vi.fn() }));

function userBook(bookId: string): UserBook {
  return {
    bookId,
    status: "reading",
    currentPage: 0,
    startedAt: 1,
    finishedAt: null,
    createdAt: 1,
    lastReadAt: 1,
  };
}

describe("uploadDomainTables book references", () => {
  const rpc = vi.fn().mockResolvedValue({ data: 1, error: null });

  beforeEach(() => {
    vi.clearAllMocks();
    const booksSelect = vi.fn().mockResolvedValue({
      data: [{ id: "server-book", isbn13: "", title: "서버 책", authors: ["작가"] }],
      error: null,
    });
    vi.mocked(getSupabase).mockReturnValue({
      from: vi.fn(() => ({ select: booksSelect })),
      rpc,
    } as never);
  });

  it("accepts a child row that references an existing server book", async () => {
    await expect(
      uploadDomainTables({ userBooks: [userBook("server-book")] }),
    ).resolves.toEqual({ imported: 1 });
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("rejects an unknown book reference before the import RPC", async () => {
    await expect(
      uploadDomainTables({ userBooks: [userBook("missing-book")] }),
    ).rejects.toThrow("unknown book reference");
    expect(rpc).not.toHaveBeenCalled();
  });
});
