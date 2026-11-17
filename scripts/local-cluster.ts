// The throwaway PostgreSQL 18 cluster of the local test commands (issues #101
// and #185): npm run test:e2e:local and npm run test:local. PostgreSQL comes
// from the git-ignored .tools/ folder (AGENTS.md, section 2), and a missing
// tool stops the run with what to download, never a download.
//
// A run never reads .env.local or a Neon branch for its database: it sets
// every variable of .env.example itself, empty unless the run needs it, and
// Node.js, Next.js, Payload and Vitest's config never override a variable the
// process already has. The cluster gets a generated password, written to no
// committed file, and is deleted when the run ends, fails or is interrupted;
// a cluster left by a killed run is deleted by the next run of the same
// command. Each command has its own folder and a free port from the system,
// so the two can run at the same time without sharing a cluster or a port.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { availableParallelism } from "node:os";
import { join, resolve } from "node:path";
import { localMaxConnections } from "./local-db.ts";

export const root = resolve(import.meta.dirname, "..");
export const tools = join(root, ".tools");
const pgBin = join(tools, "pgsql", "bin");
const exe = (name: string) =>
  join(pgBin, process.platform === "win32" ? `${name}.exe` : name);

/** The cluster folder of one command, in .tools/. */
export const clusterFolder = (command: string) =>
  join(tools, `${command}-postgres`);

/** What to download for PostgreSQL, or nothing when it is there. */
export function missingPostgres(): string[] {
  return existsSync(exe("pg_ctl"))
    ? []
    : [
        `PostgreSQL 18.6 in .tools/pgsql (no ${exe("pg_ctl")}): EDB's postgresql-18.6-1-windows-x64-binaries.zip from get.enterprisedb.com, unpacked so that .tools/pgsql/bin holds pg_ctl.`,
      ];
}

/** Stops the run, exit code 2, when a tool is missing. */
export function stopIfMissing(missing: string[]) {
  if (missing.length === 0) return;
  console.error(
    `Missing tools; nothing was downloaded:\n- ${missing.join("\n- ")}`,
  );
  process.exit(2);
}

/** Runs a command, its output shown, and throws if it fails. */
export function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
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

/** Stops a cluster left in a folder, then deletes the folder. */
function removeCluster(work: string) {
  const data = join(work, "data");
  if (existsSync(join(data, "postmaster.pid")))
    spawnSync(exe("pg_ctl"), ["stop", "-D", data, "-m", "immediate", "-w"], {
      stdio: "inherit",
    });
  rmSync(work, { recursive: true, force: true });
}

/**
 * The environment of a run: every variable .env.example names set, empty
 * unless given, so none comes from .env.local, and no Vercel variable.
 */
export function runEnvironment(
  given: Record<string, string>,
  base: NodeJS.ProcessEnv = process.env,
  example = readFileSync(join(root, ".env.example"), "utf8"),
): NodeJS.ProcessEnv {
  const declared = example
    .split(/\r?\n/)
    .map((line) => /^([A-Z][A-Z0-9_]*)=/.exec(line)?.[1])
    .filter((name): name is string => Boolean(name));
  const env: NodeJS.ProcessEnv = {
    ...base,
    ...Object.fromEntries(declared.map((name) => [name, ""])),
    ...given,
  };
  for (const name of Object.keys(env))
    if (name.startsWith("VERCEL_")) delete env[name];
  return env;
}

/**
 * Creates the command's cluster, migrated and loaded as CI's jobs do, runs
 * the steps on it, deletes it and exits: 0 when every step passed, else 1.
 */
export async function withCluster(
  command: string,
  given: Record<string, string>,
  steps: (env: NodeJS.ProcessEnv) => void,
): Promise<never> {
  const work = clusterFolder(command);
  const data = join(work, "data");
  if (existsSync(work)) {
    console.log("Deleting the cluster a previous run left.");
    removeCluster(work);
  }

  const password = randomBytes(24).toString("hex");
  const port = await freePort();
  const url = `postgres://sekoya:${password}@127.0.0.1:${port}/sekoya`;
  const env = runEnvironment({
    DATABASE_URL: url,
    DATABASE_URL_UNPOOLED: url,
    PAYLOAD_SECRET: randomBytes(24).toString("hex"),
    // The catalog CI's jobs load, which the fake Algolia rebuilds its records
    // from: an empty value is an error there, not the default.
    CATALOG_SCALE: "small",
    CATALOG_SEED: "1",
    NEXT_TELEMETRY_DISABLED: "1",
    ...given,
  });

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
        `-p ${port} -h 127.0.0.1 -c max_connections=${localMaxConnections(availableParallelism())}`,
      ],
      env,
    );
    run(
      exe("createdb"),
      ["-h", "127.0.0.1", "-p", `${port}`, "-U", "sekoya", "sekoya"],
      { ...env, PGPASSWORD: password },
    );
    // The same first steps as CI's jobs, in their order.
    run("npm", ["run", "payload", "--", "migrate"], env);
    run(
      "npm",
      ["run", "generate", "--", "--scale", "small", "--seed", "1"],
      env,
    );
    steps(env);
  } catch (error) {
    failed = true;
    console.error(interrupted ? "Interrupted." : (error as Error).message);
  } finally {
    removeCluster(work);
    console.log(
      `Cluster deleted. ${failed ? "Failed" : "Passed"} in ${Math.round((Date.now() - started) / 1000)} s.`,
    );
  }
  process.exit(failed ? 1 : 0);
}
