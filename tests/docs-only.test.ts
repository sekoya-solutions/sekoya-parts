// The documentation-only decision (issue #91): only Markdown changes skip the
// heavy checks and Vercel's build, the comparison is between two trees, and a
// missing base means building.
import { execFileSync } from "node:child_process";
import { mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { changedFiles, isDocsOnly, vercelBase } from "../scripts/docs-only.ts";

describe("isDocsOnly", () => {
  it("accepts Markdown anywhere in the repository", () => {
    expect(isDocsOnly(["AGENTS.md", "docs/adr/0004-testing-and-ci.md"])).toBe(
      true,
    );
  });

  it("refuses a list mixing Markdown and code", () => {
    expect(isDocsOnly(["docs/roadmap.md", "app/layout.tsx"])).toBe(false);
  });

  it("refuses files that only look like Markdown", () => {
    expect(isDocsOnly([".markdownlint-cli2.jsonc"])).toBe(false);
    expect(isDocsOnly(["README.MD"])).toBe(false);
    expect(isDocsOnly(["notes.md.ts"])).toBe(false);
  });

  it("accepts identical trees", () => {
    expect(isDocsOnly([])).toBe(true);
  });
});

describe("changedFiles", () => {
  let repo: string;
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  const commit = (message: string) => {
    git("add", "-A");
    git(
      "-c",
      "user.name=test",
      "-c",
      "user.email=test@example.invalid",
      "commit",
      "--quiet",
      "--no-gpg-sign",
      "-m",
      message,
    );
    return git("rev-parse", "HEAD");
  };
  let base: string;
  let docs: string;
  let code: string;
  let renamed: string;

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), "docs-only-"));
    git("init", "--quiet");
    writeFileSync(join(repo, "README.md"), "# Title\n");
    writeFileSync(join(repo, "page.ts"), "export const a = 1;\n");
    base = commit("base");
    writeFileSync(join(repo, "README.md"), "# Title\n\nMore.\n");
    docs = commit("docs");
    writeFileSync(join(repo, "page.ts"), "export const a = 2;\n");
    code = commit("code");
    renameSync(join(repo, "page.ts"), join(repo, "page.md"));
    renamed = commit("rename");
  });

  afterAll(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("lists the Markdown file of a documentation commit", () => {
    expect(changedFiles(base, docs, repo)).toEqual(["README.md"]);
  });

  it("compares whole trees, so an earlier code commit still counts", () => {
    expect(changedFiles(base, code, repo).sort()).toEqual([
      "README.md",
      "page.ts",
    ]);
    expect(isDocsOnly(changedFiles(base, code, repo))).toBe(false);
  });

  it("lists both paths of a rename from code to Markdown", () => {
    expect(changedFiles(code, renamed, repo).sort()).toEqual([
      "page.md",
      "page.ts",
    ]);
    expect(isDocsOnly(changedFiles(code, renamed, repo))).toBe(false);
  });

  it("throws on an unknown commit, which the script turns into building", () => {
    expect(() => changedFiles("0".repeat(40), docs, repo)).toThrow();
  });
});

describe("vercelBase", () => {
  const repoVars = {
    VERCEL_GIT_REPO_OWNER: "sekoya-solutions",
    VERCEL_GIT_REPO_SLUG: "sekoya-parts",
  };
  const url = "https://github.com/sekoya-solutions/sekoya-parts.git";

  it("compares a preview with the tip of main", () => {
    expect(vercelBase({ ...repoVars, VERCEL_ENV: "preview" })).toEqual({
      url,
      ref: "main",
    });
  });

  it("compares production with its last successful deployment", () => {
    expect(
      vercelBase({
        ...repoVars,
        VERCEL_ENV: "production",
        VERCEL_GIT_PREVIOUS_SHA: "abc123",
      }),
    ).toEqual({ url, ref: "abc123" });
  });

  it("builds when production has no previous deployment", () => {
    expect(
      vercelBase({
        ...repoVars,
        VERCEL_ENV: "production",
        VERCEL_GIT_PREVIOUS_SHA: "",
      }),
    ).toBeNull();
  });

  it("builds when the system variables are missing", () => {
    expect(vercelBase({ VERCEL_ENV: "preview" })).toBeNull();
    expect(vercelBase(repoVars)).toBeNull();
    expect(vercelBase({ ...repoVars, VERCEL_ENV: "development" })).toBeNull();
  });
});
