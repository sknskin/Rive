import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "@/lib/supabase/client";
import { SupabaseRepository } from "@/lib/repository/supabaseRepository";
import type { AtomicSessionWrite } from "@/lib/repository/types";

vi.mock("@/lib/supabase/client", () => ({
  getSupabase: vi.fn(),
}));

const write: AtomicSessionWrite = {
  session: {
    id: "9a351ce2-1d9b-4ad5-bdc3-1b38c9ff9442",
    bookId: "90a0ed29-a42c-47a1-81cf-c16d8ff6be62",
    startedAt: 100,
    endedAt: 200,
    durationSeconds: 100,
    startPage: 10,
    endPage: 20,
    pagesRead: 10,
    memo: "memo",
    createdAt: 300,
  },
  progressMode: "always",
  markAsRead: true,
  clearActiveSession: true,
};

describe("SupabaseRepository atomic reading-session RPCs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends the caller-owned session id unchanged so a retry remains idempotent", async () => {
    const committedIds = new Set<string>();
    let attempt = 0;
    const rpc = vi.fn(async (_name: string, params: { p_session: { id: string } }) => {
      committedIds.add(params.p_session.id);
      attempt += 1;
      return attempt === 1
        ? { data: null, error: { message: "connection lost after commit" } }
        : { data: null, error: null };
    });
    vi.mocked(getSupabase).mockReturnValue({ rpc } as never);
    const repository = new SupabaseRepository();

    await expect(repository.saveSessionAtomic(write)).rejects.toThrow("connection lost");
    await expect(repository.saveSessionAtomic(write)).resolves.toEqual(write.session);

    expect(committedIds).toEqual(new Set([write.session.id]));
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]?.[1].p_session.id).toBe(rpc.mock.calls[1]?.[1].p_session.id);
  });

  it("routes edit and delete through their atomic recompute RPCs", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(getSupabase).mockReturnValue({ rpc } as never);
    const repository = new SupabaseRepository();

    await repository.updateSessionAndRecompute(write.session.id, write.session.bookId, {
      endPage: 30,
    });
    await repository.deleteSessionAndRecompute(write.session.id, write.session.bookId);

    expect(rpc).toHaveBeenNthCalledWith(1, "update_reading_session", {
      p_session_id: write.session.id,
      p_book_id: write.session.bookId,
      p_patch: { endPage: 30 },
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "delete_reading_session", {
      p_session_id: write.session.id,
      p_book_id: write.session.bookId,
    });
  });

  it("uses a caller-id upsert fallback only while the save RPC migration is missing", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "function not found" },
    });
    const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
    const updateUserBook = vi.fn(() => ({
      eq: vi.fn(() => ({
        select: vi.fn().mockResolvedValue({ data: [{ book_id: write.session.bookId }], error: null }),
      })),
    }));
    const activeDeleteBuilder = { eq: vi.fn() };
    activeDeleteBuilder.eq.mockReturnValue(activeDeleteBuilder);
    const clearActive = vi.fn(() => activeDeleteBuilder);
    let existingSession: { id: string; book_id: string } | null = null;
    const fallbackSessions = [
      {
        id: "latest",
        book_id: write.session.bookId,
        started_at: 800,
        ended_at: 900,
        duration_seconds: 100,
        start_page: 80,
        end_page: 90,
        pages_read: 10,
        memo: "",
        created_at: 900,
      },
    ];
    const from = vi.fn((table: string) => {
      if (table === "reading_sessions") {
        return {
          upsert,
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: existingSession, error: null })),
              order: vi.fn().mockResolvedValue({ data: fallbackSessions, error: null }),
            })),
          })),
        };
      }
      if (table === "user_books") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  book_id: write.session.bookId,
                  status: "reading",
                  current_page: 10,
                  started_at: 1,
                  finished_at: null,
                  created_at: 1,
                  last_read_at: 500,
                  rating: null,
                  dnf_reason: null,
                  extra_ratings: null,
                  up_next_at: null,
                  target_date: null,
                },
                error: null,
              }),
            })),
          })),
          update: updateUserBook,
        };
      }
      if (table === "active_sessions") {
        return { delete: clearActive };
      }
      throw new Error(`unexpected table: ${table}`);
    });
    vi.mocked(getSupabase).mockReturnValue({ rpc, from } as never);

    await expect(new SupabaseRepository().saveSessionAtomic(write)).resolves.toEqual(
      write.session,
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: write.session.id, book_id: write.session.bookId }),
      { onConflict: "id" },
    );
    expect(updateUserBook).toHaveBeenCalledWith(
      expect.objectContaining({
        current_page: write.session.endPage,
        last_read_at: write.session.endedAt,
        status: "read",
        finished_at: write.session.endedAt,
      }),
    );
    expect(clearActive).toHaveBeenCalledOnce();
    expect(activeDeleteBuilder.eq).toHaveBeenNthCalledWith(1, "book_id", write.session.bookId);
    expect(activeDeleteBuilder.eq).toHaveBeenNthCalledWith(
      2,
      "started_at",
      write.session.startedAt,
    );
    expect(activeDeleteBuilder.eq).toHaveBeenNthCalledWith(
      3,
      "start_page",
      write.session.startPage,
    );
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("non-atomic compatibility fallback"),
    );

    updateUserBook.mockClear();
    await new SupabaseRepository().saveSessionAtomic({
      session: { ...write.session, id: "731baf84-4e3d-4de4-bdbb-e57884f90fb6" },
      progressMode: "if-newer",
    });
    expect(updateUserBook).not.toHaveBeenCalled();

    existingSession = { id: write.session.id, book_id: write.session.bookId };
    await new SupabaseRepository().saveSessionAtomic(write);
    expect(updateUserBook).toHaveBeenLastCalledWith(
      expect.objectContaining({ current_page: 90, last_read_at: 900 }),
    );

    existingSession = { id: write.session.id, book_id: "different-book" };
    const upsertCallsBeforeCollision = upsert.mock.calls.length;
    await expect(new SupabaseRepository().saveSessionAtomic(write)).rejects.toThrow(
      "session id collision",
    );
    expect(upsert).toHaveBeenCalledTimes(upsertCallsBeforeCollision);
  });

  it("falls back for edit/delete migration rollout but preserves other RPC errors", async () => {
    const missing = { data: null, error: { code: "PGRST202", message: "missing" } };
    const rpc = vi.fn().mockResolvedValue(missing);
    const sessionRows = [
      {
        id: write.session.id,
        book_id: write.session.bookId,
        started_at: write.session.startedAt,
        ended_at: write.session.endedAt,
        duration_seconds: write.session.durationSeconds,
        start_page: write.session.startPage,
        end_page: write.session.endPage,
        pages_read: write.session.pagesRead,
        memo: write.session.memo,
        created_at: write.session.createdAt,
      },
    ];
    const updateSession = vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn().mockResolvedValue({ data: [{ id: write.session.id }], error: null }),
        })),
      })),
    }));
    const deleteSession = vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    }));
    const updateUserBook = vi.fn(() => ({
      eq: vi.fn(() => ({
        select: vi.fn().mockResolvedValue({ data: [{ book_id: write.session.bookId }], error: null }),
      })),
    }));
    const from = vi.fn((table: string) => {
      if (table === "reading_sessions") {
        return {
          update: updateSession,
          delete: deleteSession,
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn().mockResolvedValue({ data: sessionRows, error: null }),
            })),
          })),
        };
      }
      if (table === "user_books") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  book_id: write.session.bookId,
                  status: "reading",
                  current_page: 0,
                  started_at: 1,
                  finished_at: null,
                  created_at: 1,
                  last_read_at: 1,
                  rating: null,
                  dnf_reason: null,
                  extra_ratings: null,
                  up_next_at: null,
                  target_date: null,
                },
                error: null,
              }),
            })),
          })),
          update: updateUserBook,
        };
      }
      throw new Error(`unexpected table: ${table}`);
    });
    vi.mocked(getSupabase).mockReturnValue({ rpc, from } as never);
    const repository = new SupabaseRepository();

    await repository.updateSessionAndRecompute(write.session.id, write.session.bookId, {
      endPage: 30,
    });
    await repository.deleteSessionAndRecompute(write.session.id, write.session.bookId);
    expect(updateSession).toHaveBeenCalledOnce();
    expect(deleteSession).toHaveBeenCalledOnce();
    expect(updateUserBook).toHaveBeenCalledTimes(2);

    const fatalRpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "42501", message: "permission denied" },
    });
    const fatalFrom = vi.fn();
    vi.mocked(getSupabase).mockReturnValue({ rpc: fatalRpc, from: fatalFrom } as never);
    await expect(new SupabaseRepository().saveSessionAtomic(write)).rejects.toThrow(
      "permission denied",
    );
    expect(fatalFrom).not.toHaveBeenCalled();
  });
});
