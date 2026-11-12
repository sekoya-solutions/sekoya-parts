// End-to-end tests, decided in docs/adr/0004-testing-and-ci.md: Chromium only,
// against a production build served by `next start`, with no retries and the
// trace kept on failure. Run `npm run build` first; the database comes from
// DATABASE_URL, as for the build (issue #60).
import { defineConfig, devices } from "@playwright/test";

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
  webServer: {
    command: `npm run start -- --port ${PORT}`,
    url: `http://localhost:${PORT}/`,
    // Always this run's build: a server already on the port fails the run.
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
