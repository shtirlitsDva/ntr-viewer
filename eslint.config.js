import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "src-tauri/target",
      "src-tauri/gen",
      "node_modules",
      "eslint.config.js",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ["src/**/*.{ts,tsx}", "vite.config.ts", "vitest.config.ts"],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "no-console": ["warn", { allow: ["warn", "error", "info", "debug"] }],
    },
  },
  {
    files: ["tests/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["eslint.config.js"],
    languageOptions: {
      sourceType: "module",
    },
  },
);
