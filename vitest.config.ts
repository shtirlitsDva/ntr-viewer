import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@app": fileURLToPath(new URL("./src/app", import.meta.url)),
      "@ntr": fileURLToPath(new URL("./src/ntr", import.meta.url)),
      "@viewer": fileURLToPath(new URL("./src/viewer", import.meta.url)),
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
    passWithNoTests: true,
    pool: "threads",
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    fileParallelism: false,
    minWorkers: 1,
    maxWorkers: 1,
  },
});
