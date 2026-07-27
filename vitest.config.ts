import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Loads a complete env before any test module imports src/env.ts.
    setupFiles: ["./tests/setup-env.ts"],
    // Several repo tests write real sqlite files under .tmp/ and delete them
    // afterwards; running files sequentially avoids cross-file interference.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/pages.ts"]
    }
  }
});
