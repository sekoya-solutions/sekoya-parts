// A worktree's preview entry in the main checkout's .claude/launch.json
// (issue #193): its own port, kept on a second run, and the entries of
// removed worktrees dropped, never the hand-written ones.
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  entryCheckout,
  FIRST_PORT,
  type LaunchConfig,
  type LaunchEntry,
  withWorktreeEntry,
} from "../scripts/preview-entry.ts";

const repo = join("C:", "repo");
const worktree = (name: string) => join(repo, ".claude", "worktrees", name);
const node = join(repo, ".tools", "node", "node.exe");

const nextDev: LaunchEntry = {
  name: "next-dev",
  runtimeExecutable: ".tools/node/node.exe",
  runtimeArgs: ["node_modules/next/dist/bin/next", "dev", "-p", "3001"],
  port: 3001,
};
const mainEntries: LaunchEntry[] = [
  {
    name: "next-start",
    runtimeExecutable: ".tools/node/node.exe",
    runtimeArgs: ["node_modules/next/dist/bin/next", "start"],
    port: 3000,
  },
  nextDev,
];
const config = (...extra: LaunchEntry[]): LaunchConfig => ({
  version: "0.0.1",
  configurations: [...mainEntries, ...extra],
});
const allExist = () => true;
const allFree = async () => true;

describe("a worktree's preview entry", () => {
  it("starts the worktree's own preview script with absolute paths, from port 3002", async () => {
    const { config: result, entry } = await withWorktreeEntry(
      config(),
      worktree("193-a"),
      node,
      allExist,
      allFree,
    );
    expect(entry).toEqual({
      name: "next-dev-193-a",
      runtimeExecutable: node,
      runtimeArgs: [
        join(worktree("193-a"), "scripts", "preview.ts"),
        "-p",
        String(FIRST_PORT),
      ],
      port: FIRST_PORT,
    });
    expect(result.configurations).toEqual([...mainEntries, entry]);
  });

  it("skips the ports other entries name and the ports something listens on", async () => {
    const first = await withWorktreeEntry(
      config(),
      worktree("a"),
      node,
      allExist,
      allFree,
    );
    const second = await withWorktreeEntry(
      first.config,
      worktree("b"),
      node,
      allExist,
      async (port) => port !== 3003,
    );
    expect(second.entry.port).toBe(3004);
    expect(second.config.configurations.map((entry) => entry.port)).toEqual([
      3000, 3001, 3002, 3004,
    ]);
  });

  it("keeps the entry and its port on a second run, even while its server runs", async () => {
    const first = await withWorktreeEntry(
      config(),
      worktree("a"),
      node,
      allExist,
      allFree,
    );
    const again = await withWorktreeEntry(
      first.config,
      worktree("a"),
      node,
      allExist,
      async () => false,
    );
    expect(again.entry).toEqual(first.entry);
    expect(again.config).toEqual(first.config);
  });

  it("drops the entries of removed worktrees and keeps the hand-written ones", async () => {
    const gone = await withWorktreeEntry(
      config(),
      worktree("gone"),
      node,
      allExist,
      allFree,
    );
    const { config: result, removed } = await withWorktreeEntry(
      gone.config,
      worktree("new"),
      node,
      (folder) => folder !== worktree("gone"),
      allFree,
    );
    expect(removed).toEqual(["next-dev-gone"]);
    expect(result.configurations.map((entry) => entry.name)).toEqual([
      "next-start",
      "next-dev",
      "next-dev-new",
    ]);
    expect(result.configurations.at(-1)?.port).toBe(FIRST_PORT);
  });

  it("recognizes only the entries this script writes", () => {
    expect(entryCheckout(nextDev)).toBeUndefined();
    expect(
      entryCheckout({
        ...nextDev,
        runtimeArgs: [join(worktree("x"), "scripts", "preview.ts")],
      }),
    ).toBe(worktree("x"));
  });

  it("stops when no port is free", async () => {
    await expect(
      withWorktreeEntry(
        config(),
        worktree("a"),
        node,
        allExist,
        async () => false,
      ),
    ).rejects.toThrow(/No free port/);
  });
});
