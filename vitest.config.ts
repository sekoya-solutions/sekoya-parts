import { defineConfig } from "vitest/config";

// Locally, the database tests read the same git-ignored .env.local as the app;
// variables already set (as in CI) take precedence.
try {
  process.loadEnvFile(".env.local");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // The generator tests walk about two million rows; the database tests
    // start Payload and read a remote database.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
