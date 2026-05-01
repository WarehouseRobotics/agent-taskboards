import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["api/**/*.test.ts", "ui/**/*.test.ts", "ui/**/*.test.tsx"],
  },
});
