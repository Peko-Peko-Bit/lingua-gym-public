import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // 「意図的に未使用」の印として _ 始まりの引数・変数を許容する
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // PWA build artifacts (@ducanh2912/next-pwa):
    "public/sw.js",
    "public/swe-worker-*.js",
    "public/workbox-*.js",
    // Deno runtime code (Edge Functions) — Node/Next 前提のルールでは誤検知する:
    "supabase/functions/**",
  ]),
]);

export default eslintConfig;
