import js from "@eslint/js";
import tseslint from "typescript-eslint";

const runtimeGlobals = {
  atob: "readonly",
  console: "readonly",
  crypto: "readonly",
  fetch: "readonly",
  process: "readonly",
  Request: "readonly",
  Response: "readonly",
  URL: "readonly",
  TextEncoder: "readonly",
  TextDecoder: "readonly",
};

export default tseslint.config(
  {
    ignores: ["node_modules/**", "dist/**", "coverage/**", ".wrangler/**"],
  },
  {
    languageOptions: {
      globals: runtimeGlobals,
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
