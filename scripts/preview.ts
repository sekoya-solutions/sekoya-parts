// Starts the development server of the checkout this file belongs to, the
// main one or a git worktree (issue #193), as `npm run dev` does: Payload's
// pending migrations first, then `next dev`, only if they succeed.
//
// The desktop app's preview tool reads the main checkout's
// .claude/launch.json and starts every command there, whichever folder the
// session works in. This script finds its checkout from its own path, not
// from the folder it is started in, and runs both steps there, so they read
// that checkout's code, node_modules, .next and .env.local. Its entries are
// written by scripts/preview-entry.ts.
//
// Usage: node <checkout>/scripts/preview.ts [next dev arguments, e.g. -p 3002]
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
// Payload's migration starts `node` by name: the preview tool starts this
// script without Node.js on the PATH, so its own Node.js comes first, as
// npm does for its scripts. Windows names the variable Path, and a copy of
// the environment with both spellings would be ambiguous, so the existing
// name is kept.
const pathKey =
  Object.keys(process.env).find((key) => key.toUpperCase() === "PATH") ??
  "PATH";
const env = {
  ...process.env,
  [pathKey]: [dirname(process.execPath), process.env[pathKey]]
    .filter(Boolean)
    .join(delimiter),
};

for (const needed of [".env.local", join("node_modules", "next")]) {
  if (!existsSync(join(root, needed))) {
    console.error(
      `${join(root, needed)} is missing: a worktree needs its own .env.local (a copy of the main checkout's) and its own npm ci (AGENTS.md, section 5).`,
    );
    process.exit(1);
  }
}

const migrate = spawnSync(
  process.execPath,
  [join(root, "scripts", "payload.js"), "migrate"],
  { cwd: root, env, stdio: "inherit" },
);
if (migrate.status !== 0) process.exit(migrate.status ?? 1);

const next = spawn(
  process.execPath,
  [
    join(root, "node_modules", "next", "dist", "bin", "next"),
    "dev",
    ...process.argv.slice(2),
  ],
  { cwd: root, env, stdio: "inherit" },
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => next.kill(signal));
}
next.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
