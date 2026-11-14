// End-to-end tests, decided in docs/adr/0004-testing-and-ci.md: Chromium only,
// against a production build served by `next start`, with no retries and the
// trace kept on failure. Run `npm run build` first; the database comes from
// DATABASE_URL, as for the build (issue #60).
import { defineConfig, devices } from "@playwright/test";
import { FAKE_ALGOLIA_URL } from "./e2e/fake-algolia-url.ts";

const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  // A required check never retries: a flaky test is fixed at its cause.
  retries: 0,
  forbidOnly: true,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // A fake Algolia (issue #119): the tests spend no quota and need no
      // key. It builds its records from the catalog the tests run against.
      command: "node --env-file-if-exists=.env.local e2e/fake-algolia.ts",
      url: `${FAKE_ALGOLIA_URL}/`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `npm run start -- --port ${PORT}`,
      url: `http://localhost:${PORT}/`,
      // Always this run's build: a server already on the port fails the run.
      reuseExistingServer: false,
      timeout: 60_000,
      // The site searches the fake, whatever .env.local holds: Next.js never
      // overrides a variable the process already has.
      env: {
        ...(process.env as Record<string, string>),
        ALGOLIA_APP_ID: "fake-app",
        ALGOLIA_SEARCH_KEY: "fake-search-key",
        ALGOLIA_WRITE_KEY: "",
        ALGOLIA_ENVIRONMENT: "dev",
        ALGOLIA_SEARCH_URL: FAKE_ALGOLIA_URL,
      },
    },
  ],
});
