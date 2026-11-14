// Runs the end-to-end tests on the owner's machine as CI's "End-to-end tests"
// job runs them (issue #101): a throwaway PostgreSQL 18 cluster, Payload's
// migrations, the small catalog with seed 1, a production build, then
// Playwright with Chrome Headless Shell. Nothing is installed: PostgreSQL and
// the browser come from the git-ignored .tools/ folder (AGENTS.md, section 2),
// and a missing tool stops the run with what to download, never a download.
//
// Usage: npm run test:e2e:local [-- <Playwright arguments>]
// for example: npm run test:e2e:local -- e2e/intro.spec.ts
//
// The run never reads .env.local or a Neon branch for its database: it sets
// every variable of .env.example itself, empty unless the run needs it, and
// Node.js, Next.js and Payload never override a variable the process already
// has. The cluster gets a generated password, written to no committed file,
// and is deleted when the run ends, fails or is interrupted; a cluster left
// by a killed run is deleted by the next one.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const tools = join(root, ".tools");
const pgBin = join(tools, "pgsql", "bin");
const browsers = join(tools, "ms-playwright");
const work = join(tools, "e2e-postgres");
const data = join(work, "data");
const exe = (name: string) =>
  join(pgBin, process.platform === "win32" ? `${name}.exe` : name);

// The browser build Playwright's installed version expects, as
// `playwright install --dry-run --only-shell chromium` lists it.
const SHELL_DIR = "chromium_headless_shell-1254";

function missingTools(): string[] {
  const missing: string[] = [];
  if (!existsSync(exe("pg_ctl")))
    missing.push(
      `PostgreSQL 18.6 in .tools/pgsql (no ${exe("pg_ctl")}): EDB's postgresql-18.6-1-windows-x64-binaries.zip from get.enterprisedb.com, unpacked so that .tools/pgsql/bin holds pg_ctl.`,
    );
  if (!existsSync(join(browsers, SHELL_DIR)))
    missing.push(
      `Chrome Headless Shell in .tools/ms-playwright (no ${SHELL_DIR}): PLAYWRIGHT_BROWSERS_PATH=.tools/ms-playwright npx playwright install --only-shell chromium.`,
    );
  return missing;
}

/** Runs a command, its output shown, and throws if it fails. */
function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: "inherit",
    shell: process.platform === "win32" && !command.endsWith(".exe"),
  });
  if (result.status !== 0)
    throw new Error(
      `${command} ${args.join(" ")} exited with ${result.status ?? result.signal}.`,
    );
}

/** A free local port, from the system. */
const freePort = () =>
  new Promise<number>((done, fail) => {
    const server = createServer();
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() =>
        typeof address === "object" && address
          ? done(address.port)
          : fail(new Error("No port.")),
      );
    });
  });

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

/** Stops a cluster left in the work folder, then deletes the folder. */
function cleanUp() {
  if (existsSync(join(data, "postmaster.pid")))
    spawnSync(exe("pg_ctl"), ["stop", "-D", data, "-m", "immediate", "-w"], {
      stdio: "inherit",
    });
  rmSync(work, { recursive: true, force: true });
}

const missing = missingTools();
if (missing.length > 0) {
  console.error(
    `Missing tools; nothing was downloaded:\n- ${missing.join("\n- ")}`,
  );
  process.exit(2);
}

if (existsSync(work)) {
  console.log("Deleting the cluster a previous run left.");
  cleanUp();
}

// Every variable .env.example names is set here, so none comes from
// .env.local: the database is this run's, and no Algolia, DeepL or Vercel key
// is used.
const declared = readFileSync(join(root, ".env.example"), "utf8")
  .split(/\r?\n/)
  .map((line) => /^([A-Z][A-Z0-9_]*)=/.exec(line)?.[1])
  .filter((name): name is string => Boolean(name));
const password = randomBytes(24).toString("hex");
const port = await freePort();
const url = `postgres://sekoya:${password}@127.0.0.1:${port}/sekoya`;
const env: NodeJS.ProcessEnv = {
  ...process.env,
  ...Object.fromEntries(declared.map((name) => [name, ""])),
  DATABASE_URL: url,
  DATABASE_URL_UNPOOLED: url,
  PAYLOAD_SECRET: randomBytes(24).toString("hex"),
  // The catalog this run loads, which the fake Algolia rebuilds its records
  // from: an empty value is an error there, not the default.
  CATALOG_SCALE: "small",
  CATALOG_SEED: "1",
  NEXT_TELEMETRY_DISABLED: "1",
  PLAYWRIGHT_BROWSERS_PATH: browsers,
};
for (const name of Object.keys(env))
  if (name.startsWith("VERCEL_")) delete env[name];

let interrupted = false;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    interrupted = true;
  });

const started = Date.now();
let failed = false;
try {
  console.log(
    `Database: a throwaway PostgreSQL cluster on 127.0.0.1:${port}; .env.local and Neon are not used.`,
  );
  const passwordFile = join(work, "password");
  mkdirSync(work, { recursive: true });
  writeFileSync(passwordFile, password, { mode: 0o600 });
  try {
    run(
      exe("initdb"),
      [
        "-D",
        data,
        "-U",
        "sekoya",
        `--pwfile=${passwordFile}`,
        "--auth=scram-sha-256",
        "--encoding=UTF8",
        "--locale-provider=icu",
        "--icu-locale=und",
        "--locale=C",
      ],
      env,
    );
  } finally {
    rmSync(passwordFile, { force: true });
  }
  run(
    exe("pg_ctl"),
    [
      "start",
      "-D",
      data,
      "-w",
      "-l",
      join(work, "postgres.log"),
      "-o",
      `-p ${port} -h 127.0.0.1`,
    ],
    env,
  );
  run(
    exe("createdb"),
    ["-h", "127.0.0.1", "-p", `${port}`, "-U", "sekoya", "sekoya"],
    {
      ...env,
      PGPASSWORD: password,
    },
  );
  // The same steps as CI's job, in its order.
  run("npm", ["run", "payload", "--", "migrate"], env);
  run("npm", ["run", "generate", "--", "--scale", "small", "--seed", "1"], env);
  caseSensitiveBuildFolder();
  run("npm", ["run", "build"], env);
  assertCaseSensitivePages();
  run("npm", ["run", "test:e2e", "--", ...process.argv.slice(2)], env);
} catch (error) {
  failed = true;
  console.error(interrupted ? "Interrupted." : (error as Error).message);
} finally {
  cleanUp();
  console.log(
    `Cluster deleted. ${failed ? "Failed" : "Passed"} in ${Math.round((Date.now() - started) / 1000)} s.`,
  );
}
process.exit(failed ? 1 : 0);
