// npm run dev migrates the database .env.local names before starting the
// server (issue #153): nothing else migrates the Neon dev branch, while
// Vercel's builds migrate preview and main (scripts/build.js). npm's pre
// scripts are off (ignore-scripts in .npmrc), so the dev script itself runs
// the migration, and && stops before the server when it fails.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const scripts = (
  JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts: Record<string, string>;
  }
).scripts;

describe("npm run dev", () => {
  it("applies pending migrations, then starts the server only if they succeed", () => {
    expect(scripts.dev).toBe("node scripts/payload.js migrate && next dev");
  });

  it("relies on no pre script, which ignore-scripts would skip", () => {
    expect(readFileSync(".npmrc", "utf8")).toMatch(/^ignore-scripts=true$/m);
    expect(scripts.predev).toBeUndefined();
  });
});
