import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import { designSystemGuard } from "@kasumi/ui/eslint";

export default [
  { ignores: ["node_modules", "web/dist", "test-results", "playwright-report"] },
  js.configs.recommended,
  {
    files: ["web/src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser, ...globals.es2021 },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: "18.3" } },
    plugins: { react, "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "error",
      "react/jsx-no-undef": "error",
      "no-unused-vars": ["error", { ignoreRestSiblings: true }],
    },
  },
  { ...designSystemGuard, files: ["web/src/**/*.{js,jsx}"] },
  {
    files: ["server/**/*.js", "test/**/*.js", "e2e/**/*.js", "*.config.js", "web/*.config.js"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: { ...globals.node, ...globals.es2021 } },
  },
];
