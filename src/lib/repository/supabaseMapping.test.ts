import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "@/lib/supabase/client";
import {
  rowToBook,
  rowToUserBook,
  SupabaseRepository,
  type BookRow,
  type UserBookRow,
} from "./supabaseRepository";

vi.mock("@/lib/supabase/client", () => ({ getSupabase: vi.fn() }));

describe("Supabase row mapping contracts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("omits optional book properties when database columns are null", () => {
    const row: BookRow = {
      id: "book", title: "책", authors: [], publisher: "", isbn13: "", cover_url: "",
      page_count: 0, kakao_url: "", google_books_id: "", created_at: 1,
      description: null, categories: null, enriched_at: null,
    };

    const book = rowToBook(row);

    expect(book.description).toBeUndefined();
    expect(book.categories).toBeUndefined();
    expect(book.enrichedAt).toBeUndefined();
  });

  it("omits optional user-book properties when database columns are null", () => {
    const row: UserBookRow = {
      book_id: "book", status: "reading", current_page: 0, started_at: null,
      finished_at: null, created_at: 1, last_read_at: 1, rating: null,
      dnf_reason: null, extra_ratings: null, up_next_at: null, target_date: null,
    };

    const userBook = rowToUserBook(row);

    expect(userBook.rating).toBeUndefined();
    expect(userBook.dnfReason).toBeUndefined();
    expect(userBook.targetDate).toBeUndefined();
  });

  it("maps explicit undefined patch values to SQL null", async () => {
    const select = vi.fn().mockResolvedValue({ data: [{ book_id: "book" }], error: null });
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    vi.mocked(getSupabase).mockReturnValue({
      from: vi.fn(() => ({ update })),
    } as never);

    await new SupabaseRepository().updateUserBook("book", {
      dnfReason: undefined,
      targetDate: undefined,
    });

    expect(update).toHaveBeenCalledWith({ dnf_reason: null, target_date: null });
  });
});
