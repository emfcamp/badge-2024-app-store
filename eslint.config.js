import js from "@eslint/js";
import tseslint from "typescript-eslint";
import astro from "eslint-plugin-astro";
import globals from "globals";

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      "**/node_modules/**",
      "**/build/**",
      "**/dist/**",
      "**/.astro/**",
      "packages/tildagon-app-directory-site/public/global.css",
      "packages/tildagon-app-directory-site/public/static/js/*.js",
      "**/*.toml",
    ],
  },

  // Base JS/TS recommended rules
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Node.js globals for config files
  {
    files: ["**/astro.config.mjs", "**/*.config.{mjs,js}"],
    languageOptions: {
      globals: globals.node,
    },
  },

  // Astro files
  ...astro.configs.recommended,

  // Custom project-level rules
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },

  // Allow triple-slash references in Astro env.d.ts
  {
    files: ["**/env.d.ts"],
    rules: {
      "@typescript-eslint/triple-slash-reference": "off",
    },
  },

  // Allow Node.js globals in config files
  {
    files: ["**/astro.config.mjs", "**/*.config.{js,mjs,ts}"],
    languageOptions: {
      globals: {
        process: "readonly",
      },
    },
  },
);
