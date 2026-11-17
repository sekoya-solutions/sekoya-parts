// Whether DATABASE_URL names a database on this machine: CI's job's own
// PostgreSQL, or npm run test:local's throwaway cluster (issue #185), never
// a Neon branch from a developer's .env.local (vitest.config.ts).
export function isLocalDatabase(url = process.env.DATABASE_URL): boolean {
  try {
    const host = new URL(url ?? "").hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}
