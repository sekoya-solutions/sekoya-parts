// npm run test:e2e:local stops before deleting .next while a development
// server of the checkout holds it (issue #193): runningDevServer reads the
// lock file Next.js 16 keeps in .next/dev while `next dev` runs.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runningDevServer } from "../scripts/dev-server.ts";

let checkout: string;
const lock = (content: string) => {
  mkdirSync(join(checkout, ".next", "dev"), { recursive: true });
  writeFileSync(join(checkout, ".next", "dev", "lock"), content);
};

describe("runningDevServer", () => {
  afterEach(() => rmSync(checkout, { recursive: true, force: true }));

  it("finds the server whose process still runs", () => {
    checkout = mkdtempSync(join(tmpdir(), "dev-server-"));
    lock(JSON.stringify({ pid: process.pid, appUrl: "http://localhost:3002" }));
    expect(runningDevServer(checkout)).toMatchObject({
      pid: process.pid,
      appUrl: "http://localhost:3002",
    });
  });

  it("ignores a lock left by a process that ended", () => {
    checkout = mkdtempSync(join(tmpdir(), "dev-server-"));
    const ended = spawnSync(process.execPath, ["-e", ""]).pid;
    lock(JSON.stringify({ pid: ended, appUrl: "http://localhost:3002" }));
    expect(runningDevServer(checkout)).toBeUndefined();
  });

  it("finds nothing without a lock file", () => {
    checkout = mkdtempSync(join(tmpdir(), "dev-server-"));
    expect(runningDevServer(checkout)).toBeUndefined();
  });
});
