import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    // .test.ts = node(순수 함수), .test.tsx = jsdom(컴포넌트) — 파일 상단 docblock으로 지정
    // .test.ts runs in node (pure fns); .test.tsx uses jsdom via per-file docblocks
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
