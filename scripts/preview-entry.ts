// Adds this git worktree's preview server to the main checkout's
// .claude/launch.json (issue #193), so a session working in the worktree can
// open its own branch with the preview tool: preview_start reads only the
// main checkout's file and starts its commands there, whichever folder the
// session works in.
//
// The entry, named next-dev-<worktree folder>, runs this worktree's
// scripts/preview.ts with absolute paths, on its own port: the first one
// from 3002 that no other entry names and nothing listens on, so sessions
// in different worktrees can run their previews at the same time. Running
// the command again keeps the entry and its port. Each run also removes the
// entries whose worktree folder no longer exists, and copies the main
// checkout's .env.local into a worktree that has none. launch.json stays
// git-ignored (owner decision, 2026-11-14), so the absolute paths are never
// committed.
//
// Usage, from the worktree: npm run preview:add
import { execFileSync } from "node:child_process";
import {
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { basename, dirname, join, resolve } from "node:path";

export type LaunchEntry = {
  name: string;
  runtimeExecutable: string;
  runtimeArgs: string[];
  port: number;
};
export type LaunchConfig = { version: string; configurations: LaunchEntry[] };

/** The first port worktree previews use; 3000 and 3001 are the main checkout's. */
export const FIRST_PORT = 3002;
const LAST_PORT = 3099;

/** The checkout folder an entry written by this script starts, if it is one. */
export function entryCheckout(entry: LaunchEntry): string | undefined {
  const script = entry.runtimeArgs?.[0];
  if (!script || basename(script) !== "preview.ts") return undefined;
  if (basename(dirname(script)) !== "scripts") return undefined;
  return dirname(dirname(script));
}

/**
 * The launch file with this worktree's entry and without the entries of
 * removed worktrees. `exists` tells whether a folder exists; `isFree`
 * whether nothing listens on a port.
 */
export async function withWorktreeEntry(
  config: LaunchConfig,
  worktree: string,
  nodePath: string,
  exists: (folder: string) => boolean,
  isFree: (port: number) => Promise<boolean>,
): Promise<{ config: LaunchConfig; entry: LaunchEntry; removed: string[] }> {
  const removed: string[] = [];
  const kept = config.configurations.filter((entry) => {
    const checkout = entryCheckout(entry);
    if (checkout === undefined || exists(checkout)) return true;
    removed.push(entry.name);
    return false;
  });
  const name = `next-dev-${basename(worktree)}`;
  const script = join(worktree, "scripts", "preview.ts");
  const current = kept.find((entry) => entry.name === name);
  let port = current?.port;
  if (port === undefined) {
    const named = new Set(kept.map((entry) => entry.port));
    for (let candidate = FIRST_PORT; candidate <= LAST_PORT; candidate++) {
      if (!named.has(candidate) && (await isFree(candidate))) {
        port = candidate;
        break;
      }
    }
    if (port === undefined)
      throw new Error(
        `No free port from ${FIRST_PORT} to ${LAST_PORT} for ${name}.`,
      );
  }
  const entry: LaunchEntry = {
    name,
    runtimeExecutable: nodePath,
    runtimeArgs: [script, "-p", String(port)],
    port,
  };
  const configurations = current
    ? kept.map((other) => (other === current ? entry : other))
    : [...kept, entry];
  return { config: { ...config, configurations }, entry, removed };
}

/** Whether nothing listens on the port, on any local address. */
const isFree = (port: number) =>
  new Promise<boolean>((done) => {
    const server = createServer();
    server.once("error", () => done(false));
    server.listen(port, () => server.close(() => done(true)));
  });

async function main() {
  const worktree = resolve(import.meta.dirname, "..");
  const common = execFileSync(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    { cwd: worktree, encoding: "utf8" },
  ).trim();
  const mainCheckout = dirname(resolve(common));
  if (resolve(mainCheckout) === worktree) {
    console.log(
      "This is the main checkout: its preview is the next-dev entry, on port 3001.",
    );
    return;
  }
  // The worktree's own git-ignored .env.local, copied once from the main
  // checkout's and never overwritten.
  const env = join(worktree, ".env.local");
  const mainEnv = join(mainCheckout, ".env.local");
  if (!existsSync(env)) {
    if (!existsSync(mainEnv))
      throw new Error(`No .env.local in ${mainCheckout} to copy.`);
    copyFileSync(mainEnv, env, constants.COPYFILE_EXCL);
    console.log(`Copied ${mainEnv} to ${env}.`);
  }
  const file = join(mainCheckout, ".claude", "launch.json");
  const config: LaunchConfig = existsSync(file)
    ? JSON.parse(readFileSync(file, "utf8"))
    : { version: "0.0.1", configurations: [] };
  const result = await withWorktreeEntry(
    config,
    worktree,
    realpathSync(process.execPath),
    existsSync,
    isFree,
  );
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(result.config, null, 2)}\n`);
  for (const name of result.removed)
    console.log(`Removed ${name}: its worktree no longer exists.`);
  console.log(
    `Preview entry "${result.entry.name}" on port ${result.entry.port} in ${file}.`,
  );
  console.log(
    `Start it with preview_start {name: "${result.entry.name}"}; stop it before npm run test:e2e:local, which rebuilds .next.`,
  );
}

if (import.meta.main) await main();
