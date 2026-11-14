// Where the end-to-end tests' fake Algolia listens (e2e/fake-algolia.ts):
// an IPv4 address, so no lookup of "localhost" can pick another one.
export const FAKE_ALGOLIA_PORT = 3101;
export const FAKE_ALGOLIA_URL = `http://127.0.0.1:${FAKE_ALGOLIA_PORT}`;

/**
 * Query endings that make the fake fail, so a test can fail Algolia on a
 * query that still finds models: the search key drops spaces and dashes.
 */
export const FAKE_FAILURES = {
  /** Algolia answers 500. */
  error: " -",
  /** Algolia answers 429, as for a visitor over the hourly limit. */
  limit: " --",
  /** Algolia answers after the page's time limit. */
  slow: " ---",
} as const;
