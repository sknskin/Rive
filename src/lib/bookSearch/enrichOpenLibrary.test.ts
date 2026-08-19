import { describe, expect, it } from "vitest";
import { parseOpenLibraryData } from "./enrichOpenLibrary";

describe("parseOpenLibraryData", () => {
  it("페이지 수와 주제를 BookMeta로 변환한다", () => {
    const meta = parseOpenLibraryData(
      {
        "ISBN:9788934972464": {
          number_of_pages: 636,
          subjects: [{ name: "History" }, { name: "Civilization" }, { name: "" }],
        },
      },
      "9788934972464",
    );
    expect(meta).toEqual({
      pageCount: 636,
      description: "",
      categories: ["History", "Civilization"],
    });
  });

  it("해당 ISBN 레코드가 없으면 null을 반환한다", () => {
    expect(parseOpenLibraryData({}, "9788934972464")).toBeNull();
  });

  it("페이지 수도 주제도 없으면 null을 반환한다", () => {
    expect(
      parseOpenLibraryData({ "ISBN:1234": { subjects: [] } }, "1234"),
    ).toBeNull();
  });

  it("주제는 최대 5개까지만 담는다", () => {
    const subjects = Array.from({ length: 8 }, (_, index) => ({ name: `S${index}` }));
    const meta = parseOpenLibraryData(
      { "ISBN:1234": { number_of_pages: 100, subjects } },
      "1234",
    );
    expect(meta?.categories).toHaveLength(5);
  });
});
