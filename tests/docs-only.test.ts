// The documentation-only decisions (issues #91, #106 and #123): only Markdown
// changes skip the heavy checks and Vercel's build, a missing base or history
// means building, a documentation push mirrors the previous head's jobs, a
// code push cancels the stale runs, and the Lighthouse stand-in follows what
// Vercel actually did.
import { execFileSync } from "node:child_process";
import { mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type CheckRun,
  changedFiles,
  isDocsOnly,
  jobVerdict,
  lighthouseConclusion,
  measuredAncestor,
  pushDecision,
  rangeFiles,
  scoreChecks,
  settled,
  staleRuns,
  supersedingHead,
  vercelBase,
  vercelOutcome,
  vercelPreviewPrevious,
  type WorkflowRun,
} from "../scripts/docs-only.ts";

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

describe("rangeFiles and measuredAncestor", () => {
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
      "--allow-empty",
      "-m",
      message,
    );
    return git("rev-parse", "HEAD");
  };
  // deployed → docs → code → reverted → empty, and deployed → other → other2.
  let deployed: string;
  let docs: string;
  let code: string;
  let reverted: string;
  let empty: string;
  let other: string;
  let other2: string;

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), "docs-only-range-"));
    git("init", "--quiet");
    writeFileSync(join(repo, "README.md"), "# Title\n");
    writeFileSync(join(repo, "page.ts"), "export const a = 1;\n");
    deployed = commit("deployed");
    writeFileSync(join(repo, "README.md"), "# Title\n\nMore.\n");
    docs = commit("docs");
    writeFileSync(join(repo, "page.ts"), "export const a = 2;\n");
    code = commit("code");
    writeFileSync(join(repo, "page.ts"), "export const a = 1;\n");
    reverted = commit("revert");
    empty = commit("empty");
    git("checkout", "--quiet", "--detach", deployed);
    writeFileSync(join(repo, "other.md"), "# Other\n");
    other = commit("other");
    writeFileSync(join(repo, "other.md"), "# Other\n\nMore.\n");
    other2 = commit("other 2");
  });

  afterAll(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("lists only Markdown after documentation commits", () => {
    expect(rangeFiles(deployed, docs, repo)).toEqual(["README.md"]);
  });

  it("counts a code change that a later commit reverts", () => {
    // The trees are equal, but a commit in between changed code.
    expect(isDocsOnly(changedFiles(docs, reverted, repo))).toBe(true);
    expect(rangeFiles(docs, reverted, repo)).toEqual(["page.ts"]);
  });

  it("treats an empty commit as documentation only", () => {
    expect(rangeFiles(reverted, empty, repo)).toEqual([]);
  });

  it("throws when the previous commit is not an ancestor (force-push)", () => {
    expect(() => rangeFiles(other, empty, repo)).toThrow();
    expect(() => rangeFiles("0".repeat(40), empty, repo)).toThrow();
  });

  it("finds the nearest built ancestor across documentation commits", async () => {
    const outcome = async (sha: string) =>
      sha === deployed ? ("built" as const) : ("skipped" as const);
    expect(await measuredAncestor(docs, outcome, repo)).toBe(deployed);
    expect(await measuredAncestor(other2, outcome, repo)).toBe(deployed);
  });

  it("passes over ancestors whose build failed or is still running", async () => {
    for (const result of ["failed", "pending"] as const) {
      const outcome = async (sha: string) =>
        sha === deployed ? ("built" as const) : result;
      expect(await measuredAncestor(other2, outcome, repo)).toBe(deployed);
    }
  });

  it("stops at the first code change, even one reverted later", async () => {
    // empty → reverted is Markdown only, but code → empty changes page.ts.
    const outcome = async (sha: string) =>
      sha === code || sha === deployed
        ? ("built" as const)
        : ("skipped" as const);
    expect(await measuredAncestor(empty, outcome, repo)).toBeNull();
  });

  it("finds nothing when no ancestor was built, or beyond the depth", async () => {
    const skipped = async () => "skipped" as const;
    expect(await measuredAncestor(other2, skipped, repo)).toBeNull();
    const outcome = async (sha: string) =>
      sha === deployed ? ("built" as const) : ("skipped" as const);
    expect(await measuredAncestor(other2, outcome, repo, 2)).toBeNull();
  });
});

describe("vercelPreviewPrevious", () => {
  const vars = {
    VERCEL_GIT_REPO_OWNER: "sekoya-solutions",
    VERCEL_GIT_REPO_SLUG: "sekoya-parts",
    VERCEL_GIT_COMMIT_SHA: "def456",
  };

  it("gives a preview its branch's last successful deployment", () => {
    expect(
      vercelPreviewPrevious({
        ...vars,
        VERCEL_ENV: "preview",
        VERCEL_GIT_PREVIOUS_SHA: "abc123",
      }),
    ).toEqual({
      url: "https://github.com/sekoya-solutions/sekoya-parts.git",
      previous: "abc123",
      head: "def456",
    });
  });

  it("has none on a branch's first deployment, or outside previews", () => {
    expect(
      vercelPreviewPrevious({
        ...vars,
        VERCEL_ENV: "preview",
        VERCEL_GIT_PREVIOUS_SHA: "",
      }),
    ).toBeNull();
    expect(
      vercelPreviewPrevious({
        ...vars,
        VERCEL_ENV: "production",
        VERCEL_GIT_PREVIOUS_SHA: "abc123",
      }),
    ).toBeNull();
    expect(
      vercelPreviewPrevious({
        VERCEL_ENV: "preview",
        VERCEL_GIT_PREVIOUS_SHA: "abc123",
        VERCEL_GIT_COMMIT_SHA: "def456",
      }),
    ).toBeNull();
  });
});

describe("pushDecision", () => {
  it("never makes a documentation-only pull request a code push", () => {
    // Its first run has no previous head: the stand-in must still post
    // "Lighthouse", since Vercel skips the build.
    expect(pushDecision(true, false, false)).toEqual({
      docs_only_pull_request: true,
      code_push: false,
      mirror: false,
    });
    expect(pushDecision(true, true, true).mirror).toBe(false);
  });

  it("makes a code pull request's first run a code push", () => {
    expect(pushDecision(false, false, false)).toEqual({
      docs_only_pull_request: false,
      code_push: true,
      mirror: false,
    });
  });

  it("mirrors a documentation-only push when the previous head has a run", () => {
    expect(pushDecision(false, true, true)).toEqual({
      docs_only_pull_request: false,
      code_push: false,
      mirror: true,
    });
    // No run to mirror: the heavy jobs run, and nothing is cancelled.
    expect(pushDecision(false, true, false)).toEqual({
      docs_only_pull_request: false,
      code_push: false,
      mirror: false,
    });
  });
});

describe("staleRuns", () => {
  const runs: WorkflowRun[] = [
    { id: 1, head_sha: "old", status: "in_progress" },
    { id: 2, head_sha: "old", status: "queued" },
    { id: 3, head_sha: "old", status: "completed" },
    { id: 4, head_sha: "head", status: "in_progress" },
    { id: 5, head_sha: "elsewhere", status: "in_progress" },
  ];

  it("keeps the unfinished runs of other commits", () => {
    expect(staleRuns(runs, "head").map((run) => run.id)).toEqual([1, 2, 5]);
  });

  it("keeps only the pull request's commits when given", () => {
    expect(
      staleRuns(runs, "head", new Set(["old", "head"])).map((run) => run.id),
    ).toEqual([1, 2]);
  });
});

describe("jobVerdict", () => {
  const job = (status: string, conclusion: string | null) => [
    { name: "End-to-end tests", status, conclusion },
    { name: "Generator and tests", status: "completed", conclusion: "failure" },
  ];

  it("passes on a job that succeeded or was skipped", () => {
    expect(
      jobVerdict(job("completed", "success"), "End-to-end tests", true),
    ).toBe("pass");
    expect(
      jobVerdict(job("completed", "skipped"), "End-to-end tests", true),
    ).toBe("pass");
  });

  it("fails on any other end, cancelled included", () => {
    for (const conclusion of ["failure", "cancelled", "timed_out", "neutral"])
      expect(
        jobVerdict(job("completed", conclusion), "End-to-end tests", true),
      ).toBe("fail");
  });

  it("waits while the job is queued or running, or not yet listed", () => {
    expect(
      jobVerdict(job("in_progress", null), "End-to-end tests", false),
    ).toBe("pending");
    expect(jobVerdict([], "End-to-end tests", false)).toBe("pending");
  });

  it("reports a job missing from a finished run", () => {
    expect(jobVerdict([], "End-to-end tests", true)).toBe("missing");
  });
});

describe("supersedingHead", () => {
  const changes: Record<string, string[]> = {
    docs: ["docs/roadmap.md"],
    code: ["app/page.tsx", "docs/roadmap.md"],
  };
  const compare = (_base: string, head: string) => {
    const files = changes[head];
    if (!files) throw new Error("unknown commit");
    return files;
  };

  it("is null while the run's commit is still the head", () => {
    expect(supersedingHead("sha", ["sha"], compare)).toBeNull();
  });

  it("is null when only documentation follows", () => {
    expect(supersedingHead("sha", ["docs"], compare)).toBeNull();
  });

  it("names a later head that changes code", () => {
    expect(supersedingHead("sha", ["docs", "code"], compare)).toBe("code");
  });

  it("lets the run go on when the comparison fails", () => {
    expect(supersedingHead("sha", ["gone"], compare)).toBeNull();
  });
});

describe("settled", () => {
  // A stand-in for the 30-second wait: reads until a value or the cap.
  const reads =
    (limit: number) =>
    async <T>(read: () => Promise<T | null>) => {
      for (let i = 0; i < limit; i++) {
        const value = await read();
        if (value !== null) return value;
      }
      return null;
    };

  it("waits for a build that is still running", async () => {
    const answers = ["pending", "pending", "built"] as const;
    let call = 0;
    const outcome = settled(
      async () => answers[call++] ?? "built",
      reads(5),
      20,
    );
    expect(await outcome("sha")).toBe("built");
    expect(call).toBe(3);
  });

  it("gives up as pending at the cap", async () => {
    const outcome = settled(async () => "pending" as const, reads(3), 20);
    expect(await outcome("sha")).toBe("pending");
  });

  it("does not wait for a commit Vercel never reported", async () => {
    const outcome = settled(async () => "unreported" as const, reads(3), 20);
    expect(await outcome("sha")).toBe("unreported");
  });
});

describe("scoreChecks", () => {
  it("keeps the finished per-page checks only", () => {
    const runs: CheckRun[] = [
      { name: "Lighthouse", status: "completed", conclusion: "success" },
      {
        name: "Lighthouse scores · home",
        status: "completed",
        conclusion: "success",
      },
      {
        name: "Lighthouse scores · product",
        status: "in_progress",
        conclusion: null,
      },
      {
        name: "Lighthouse stand-in",
        status: "completed",
        conclusion: "skipped",
      },
    ];
    expect(scoreChecks(runs).map((run) => run.name)).toEqual([
      "Lighthouse scores · home",
    ]);
  });
});

describe("vercelOutcome", () => {
  const status = (state: string, description: string) => [
    { context: "Vercel", state, description },
  ];

  it("tells a missing status from a build still running", () => {
    expect(vercelOutcome([], 0)).toBe("unreported");
    expect(
      vercelOutcome(status("pending", "Vercel is deploying your app"), 0),
    ).toBe("pending");
  });

  it("recognizes a build skipped by the Ignored Build Step", () => {
    expect(
      vercelOutcome(status("success", "Canceled by Ignored Build Step"), 0),
    ).toBe("skipped");
  });

  it("counts anything else that succeeded as built", () => {
    expect(
      vercelOutcome(status("success", "Deployment has completed"), 1),
    ).toBe("built");
    // A deployment exists, so the build ran whatever the wording says.
    expect(
      vercelOutcome(status("success", "Canceled by Ignored Build Step"), 1),
    ).toBe("built");
    // Unknown wording: the real Lighthouse is expected, never a stand-in.
    expect(vercelOutcome(status("success", "Skipped"), 0)).toBe("built");
  });

  it("reports a failed build", () => {
    expect(vercelOutcome(status("failure", "Deployment has failed"), 0)).toBe(
      "failed",
    );
    expect(vercelOutcome(status("error", ""), 0)).toBe("failed");
  });
});

describe("lighthouseConclusion", () => {
  it("is null while Lighthouse is missing or running", () => {
    expect(lighthouseConclusion([])).toBeNull();
    expect(
      lighthouseConclusion([
        { name: "Lighthouse", status: "in_progress", conclusion: null },
      ]),
    ).toBeNull();
  });

  it("gives the Lighthouse check's conclusion, not its namesakes'", () => {
    expect(
      lighthouseConclusion([
        {
          name: "Lighthouse stand-in",
          status: "completed",
          conclusion: "skipped",
        },
        { name: "Lighthouse", status: "completed", conclusion: "failure" },
      ]),
    ).toBe("failure");
  });
});
