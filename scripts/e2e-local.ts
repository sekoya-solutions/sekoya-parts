// Runs the end-to-end tests on the owner's machine as CI's "End-to-end tests"
// job runs them (issue #101): a throwaway PostgreSQL 18 cluster, Payload's
// migrations, the small catalog with seed 1, a production build, then
// Playwright with Chrome Headless Shell. Nothing is installed: PostgreSQL and
// the browser come from the git-ignored .tools/ folder (AGENTS.md, section 2),
// and a missing tool stops the run with what to download, never a download.
// The cluster and its isolation from .env.local and Neon are shared with
// npm run test:local (scripts/local-cluster.ts).
//
// Usage: npm run test:e2e:local [-- <Playwright arguments>]
// for example: npm run test:e2e:local -- e2e/intro.spec.ts
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { runningDevServer } from "./dev-server.ts";
import {
  clusterFolder,
  missingPostgres,
  root,
  run,
  stopIfMissing,
  tools,
  withCluster,
} from "./local-cluster.ts";

const browsers = join(tools, "ms-playwright");
const work = clusterFolder("e2e");

// The browser build Playwright's installed version expects, as
// `playwright install --dry-run --only-shell chromium` lists it.
const SHELL_DIR = "chromium_headless_shell-1254";

function missingBrowser(): string[] {
  return existsSync(join(browsers, SHELL_DIR))
    ? []
    : [
        `Chrome Headless Shell in .tools/ms-playwright (no ${SHELL_DIR}): PLAYWRIGHT_BROWSERS_PATH=.tools/ms-playwright npx playwright install --only-shell chromium.`,
      ];
}

/**
 * On Windows, makes the build folder case-sensitive, as on Linux, keeping
 * Next.js's build cache. Next.js stores each prerendered page as a file named
 * after its address, so on a case-insensitive folder /FR and /fr share one
 * file: /FR answered 200 with the French home page instead of 404, and a
 * request to it overwrote /fr's cached page for the next test. Windows sets
 * the attribute only on an empty folder, without administrator rights, and
 * the folders created in it inherit it.
 */
function caseSensitiveBuildFolder() {
  if (process.platform !== "win32") return;
  const next = join(root, ".next");
  const cache = join(next, "cache");
  const kept = join(work, "next-cache");
  if (existsSync(cache)) renameSync(cache, kept);
  rmSync(next, { recursive: true, force: true });
  mkdirSync(next);
  run(
    "fsutil.exe",
    ["file", "setCaseSensitiveInfo", next, "enable"],
    process.env,
  );
  if (existsSync(kept)) renameSync(kept, cache);
}

/** Throws unless the prerendered pages' folder is case-sensitive. */
function assertCaseSensitivePages() {
  if (process.platform !== "win32") return;
  const pages = join(root, ".next", "server", "app");
  const result = spawnSync(
    "fsutil.exe",
    ["file", "queryCaseSensitiveInfo", pages],
    { encoding: "utf8" },
  );
  if (!/ is enabled\./.test(result.stdout ?? ""))
    throw new Error(
      `${pages} is not case-sensitive: ${(result.stdout || result.stderr || "").trim()}`,
    );
}

stopIfMissing([...missingPostgres(), ...missingBrowser()]);

// On Windows the build folder is deleted before the build (see
// caseSensitiveBuildFolder), which fails while this checkout's development
// server, a preview, holds it (issue #193).
const server =
  process.platform === "win32" ? runningDevServer(root) : undefined;
if (server) {
  console.error(
    `A development server of this checkout${server.appUrl ? ` (${server.appUrl})` : ""} holds .next, which this run deletes: stop it (preview_stop for a preview), then run again.`,
  );
  process.exit(2);
}

await withCluster("e2e", { PLAYWRIGHT_BROWSERS_PATH: browsers }, (env) => {
  caseSensitiveBuildFolder();
  run("npm", ["run", "build"], env);
  assertCaseSensitivePages();
  run("npm", ["run", "test:e2e", "--", ...process.argv.slice(2)], env);
});
