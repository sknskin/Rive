import { expect, test } from "@playwright/test";

const SEARCH_RESULT = {
  title: "검증용 책",
  authors: ["테스트 작가"],
  publisher: "테스트 출판사",
  isbn13: "9780000000001",
  coverUrl: "",
  pageCount: 240,
  kakaoUrl: "",
  googleBooksId: "test-volume",
  description: "자동 검증용 도서",
};

test("saves a local reading session and shows it in Today", async ({ page }) => {
  await page.route("**/api/books/search?**", async (route) => {
    await route.fulfill({ json: { results: [SEARCH_RESULT], source: "google" } });
  });
  await page.route("**/api/books/enrich?**", async (route) => {
    await route.fulfill({ json: { pageCount: 240, description: "자동 검증용 도서", categories: [] } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "책 추가" }).click();
  await page.getByRole("searchbox", { name: "책 제목이나 저자 검색" }).fill("검증용 책");
  await expect(page.getByText("검색 결과 1개")).toBeAttached();
  await page.getByRole("button", { name: /검증용 책.*읽기 시작/ }).click();
  await page.getByRole("button", { name: "바로 읽기 시작" }).click();
  await page.getByRole("button", { name: "읽기 시작" }).click();

  await expect(page).toHaveURL(/\/read$/);
  await page.waitForTimeout(5_100);
  await page.getByRole("button", { name: "STOP" }).click();
  await page.getByRole("spinbutton", { name: "몇 페이지까지 읽었나요?" }).fill("10");
  await page.getByRole("textbox", { name: "독서 메모" }).fill("E2E 저장 확인");
  await page.getByRole("button", { name: "저장" }).click();

  await expect(page).toHaveURL(/\/$/);
  const today = page.getByRole("region", { name: "오늘의 독서 기록" });
  await expect(today.getByText("검증용 책", { exact: true })).toBeVisible();
  await expect(today.getByText("p.1 → p.10", { exact: true })).toBeVisible();
  await expect(today.getByText("E2E 저장 확인", { exact: true })).toBeVisible();
});

test("serves baseline browser security headers", async ({ request }) => {
  const response = await request.get("/");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
});
