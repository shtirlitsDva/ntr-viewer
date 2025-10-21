import { defineConfig } from "vite";

export default defineConfig({
  root: "app",
  base: "./",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    target: ["chrome110", "safari16"],
  },
  server: {
    strictPort: true,
    port: 1420,
  },
  envPrefix: ["VITE_", "TAURI_"],
});
