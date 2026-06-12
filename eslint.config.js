import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

export default tseslint.config(
  // ── 全局忽略 ──────────────────────────────────────────────
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.pnpm-store/**",
    ],
  },

  // ── 基础 JS / TS 规则（全包生效） ─────────────────────────
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  // ── 前端 (React + Vite) ───────────────────────────────────
  {
    files: ["packages/frontend/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      // React Hooks
      ...reactHooks.configs.recommended.rules,
      // React Refresh (HMR)
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },

  // ── 后端 (Node.js + Express) ──────────────────────────────
  {
    files: ["packages/backend/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // ── 根目录配置文件（允许 CJS 风格的模块导出） ─────────────
  {
    files: [
      "*.config.{js,mjs,cjs,ts}",
      "packages/*/*.config.{js,mjs,cjs,ts}",
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
);
