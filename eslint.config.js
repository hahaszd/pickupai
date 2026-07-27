import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import globals from "globals";

// ESLint 9 flat config. `npm run lint` was broken before this file existed —
// ESLint 9 no longer reads .eslintrc.*, and none was ever committed.
export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      ".tmp/**",
      "data/**",
      "public/**",
      "coverage/**"
    ]
  },

  js.configs.recommended,

  // TypeScript sources (src/, tests/, .ts scripts)
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module"
      },
      globals: { ...globals.node }
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // The codebase leans on `any` at the sql.js / Twilio webhook boundaries
      // where payload shapes are genuinely untyped. Warn, don't block.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
      ],
      // Handled by tsc with `strict: true`; the base rule misfires on TS.
      "no-unused-vars": "off",
      "no-undef": "off"
    }
  },

  // Plain-JS operator scripts in scripts/ — looser, they are throwaway tooling.
  {
    files: ["scripts/**/*.mjs", "scripts/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node }
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }]
    }
  },

  // Applies to every file under scripts/ (both .ts and .mjs), so it must come
  // after the two blocks above.
  {
    files: ["scripts/**"],
    rules: {
      // The lead scrapers escape `-` inside character classes (`[\w\-]`).
      // Redundant, but valid and correct — rewriting 14 live scraper regexes
      // to satisfy a style rule is pure risk. Surface it, don't block on it.
      "no-useless-escape": "warn",
      // Scrapers routinely swallow per-row parse failures on purpose.
      "no-empty": ["warn", { allowEmptyCatch: true }],
      // Both added to eslint:recommended in ESLint 10. Worth knowing about,
      // not worth blocking ad-hoc operator tooling on.
      "no-useless-assignment": "warn",
      "preserve-caught-error": "warn"
    }
  }
];
