// Decides whether a change is documentation only: every file whose content
// differs between two commits ends in ".md". The two trees are compared
// directly, with no merge base, so the answer needs no history: when it is
// "documentation only", the code of the head commit is exactly the code of
// the base commit, which has already been built and tested.
// - Issue #91: a pull request compared with its base.
// - Issue #106: a push compared with the pull request's previous head, which
//   skips the heavy checks only when every check on that head passed. Vercel
//   skips a preview when every commit since the branch's last deployment
//   changes only Markdown; CI then copies that deployment's Lighthouse
//   result onto the new head.
//
// Exit code 0 means documentation only (or checks passed, or the stand-in did
// its job); any other exit, including an error, means the change touches code,
// so a failure never skips a check or a build.
//
// Usage:
//   node scripts/docs-only.ts <base> <head>   compares two commits already
//                                             fetched (GitHub Actions)
//   node scripts/docs-only.ts --vercel        Vercel's ignoreCommand: fetches
//                                             the base from GitHub itself
//   node scripts/docs-only.ts --checks-passed <sha>
//                                             every check on <sha> passed
//   node scripts/docs-only.ts --stand-in <head>
//                                             waits for Vercel on <head>; if
//                                             it skipped the build, posts the
//                                             Lighthouse result of the last
//                                             built commit with the same code
import { execFileSync } from "node:child_process";

/**
 * True when every path ends in ".md". An empty list is true too: the two
 * trees are identical, so there is no code to build or test.
 */
export const isDocsOnly = (files: readonly string[]): boolean =>
  files.every((file) => file.endsWith(".md"));

/**
 * The paths whose content differs between two commits. With --no-renames, a
 * renamed file lists both its old and new path, so renaming code to Markdown
 * still counts as a code change.
 */
export const changedFiles = (base: string, head: string, cwd?: string) =>
  execFileSync(
    "git",
    ["diff", "--name-only", "--no-renames", "-z", base, head, "--"],
    { cwd, encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean);

/**
 * The paths changed by any commit after `from` up to `to`, each commit
 * compared with each of its parents (-m), so a code change reverted later in
 * the range still counts. Throws unless `from` is an ancestor of `to` in the
 * local history: after a force-push, or beyond a shallow clone's depth, there
 * is no range to read.
 */
export const rangeFiles = (from: string, to: string, cwd?: string) => {
  // Exit 1 means "not an ancestor" and throws, like any other failure.
  execFileSync("git", ["merge-base", "--is-ancestor", from, to], {
    cwd,
    stdio: "ignore",
  });
  return [
    ...new Set(
      execFileSync(
        "git",
        [
          "log",
          "--format=",
          "--name-only",
          "--no-renames",
          "-m",
          "-z",
          `${from}..${to}`,
          "--",
        ],
        { cwd, encoding: "utf8" },
      )
        .split(/[\0\n]/)
        .filter(Boolean),
    ),
  ];
};

/**
 * What Vercel's build compares against, from its system environment
 * variables, or null when the build must go ahead.
 * - Production: the last commit Vercel deployed successfully on main
 *   (VERCEL_GIT_PREVIOUS_SHA), which is the code production serves.
 * - Preview: the tip of main, the code every pull request is checked against.
 */
export const vercelBase = (
  env: Readonly<Record<string, string | undefined>>,
): { url: string; ref: string } | null => {
  const owner = env.VERCEL_GIT_REPO_OWNER;
  const slug = env.VERCEL_GIT_REPO_SLUG;
  if (!owner || !slug) return null;
  const url = `https://github.com/${owner}/${slug}.git`;
  if (env.VERCEL_ENV === "production") {
    const previous = env.VERCEL_GIT_PREVIOUS_SHA;
    return previous ? { url, ref: previous } : null;
  }
  if (env.VERCEL_ENV === "preview") return { url, ref: "main" };
  return null;
};

/**
 * A preview's second chance to skip (issue #106): the branch's last
 * successful deployment (VERCEL_GIT_PREVIOUS_SHA), when every commit since
 * then changes only Markdown. Null when there is none, or outside previews.
 */
export const vercelPreviewPrevious = (
  env: Readonly<Record<string, string | undefined>>,
): { url: string; previous: string; head: string } | null => {
  const base = vercelBase(env);
  const previous = env.VERCEL_GIT_PREVIOUS_SHA;
  const head = env.VERCEL_GIT_COMMIT_SHA;
  if (env.VERCEL_ENV !== "preview" || !base || !previous || !head) return null;
  return { url: base.url, previous, head };
};

/** The checks that branch protection requires on main (ADR 0004). */
export const REQUIRED_CHECKS = [
  "Markdown lint",
  "Lint, types and build",
  "Generator and tests",
  "End-to-end tests",
  "Lighthouse",
] as const;
export const REQUIRED_STATUSES = ["Vercel"] as const;

export type CheckRun = {
  name: string;
  status: string;
  conclusion: string | null;
};
export type CommitStatus = { context: string; state: string };

/**
 * Whether a commit's checks allow its documentation-only successor to skip
 * them: every check run completed as success or skipped, every status is
 * success, and every required check and status is there. `complete` is false
 * when the API returned only part of the list.
 */
export const checksPassed = (
  runs: readonly CheckRun[],
  statuses: readonly CommitStatus[],
  complete: boolean,
): { passed: boolean; reason: string } => {
  if (!complete) return { passed: false, reason: "incomplete check list" };
  for (const run of runs) {
    if (
      run.status !== "completed" ||
      (run.conclusion !== "success" && run.conclusion !== "skipped")
    ) {
      return {
        passed: false,
        reason: `"${run.name}" is ${run.conclusion ?? run.status}`,
      };
    }
  }
  for (const status of statuses) {
    if (status.state !== "success") {
      return {
        passed: false,
        reason: `status "${status.context}" is ${status.state}`,
      };
    }
  }
  const names = new Set(runs.map((run) => run.name));
  const missing = REQUIRED_CHECKS.find((name) => !names.has(name));
  if (missing) return { passed: false, reason: `"${missing}" is missing` };
  const contexts = new Set(statuses.map((status) => status.context));
  const missingStatus = REQUIRED_STATUSES.find((name) => !contexts.has(name));
  if (missingStatus) {
    return { passed: false, reason: `status "${missingStatus}" is missing` };
  }
  return { passed: true, reason: "every check passed" };
};

/**
 * What Vercel did with a commit, from its "Vercel" status and the GitHub
 * deployments it created. A skipped build is a success status that names the
 * Ignored Build Step and has no deployment; Vercel does not document that
 * wording, so anything else counts as built, and the real Lighthouse runs.
 */
export const vercelOutcome = (
  statuses: readonly (CommitStatus & { description?: string | null })[],
  deployments: number,
): "pending" | "skipped" | "built" | "failed" => {
  const vercel = statuses.find((status) => status.context === "Vercel");
  if (!vercel || vercel.state === "pending") return "pending";
  if (vercel.state !== "success") return "failed";
  return deployments === 0 &&
    /Ignored Build Step/i.test(vercel.description ?? "")
    ? "skipped"
    : "built";
};

/** The "Lighthouse" check's conclusion, or null while it is missing or running. */
export const lighthouseConclusion = (runs: readonly CheckRun[]) => {
  const run = runs.find((candidate) => candidate.name === "Lighthouse");
  return run && run.status === "completed" ? (run.conclusion ?? "") : null;
};

// GitHub's REST API, with the workflow's own token.
const api = async (path: string, init?: RequestInit) => {
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!repository || !token)
    throw new Error("GITHUB_REPOSITORY or GITHUB_TOKEN missing");
  const response = await fetch(
    `https://api.github.com/repos/${repository}/${path}`,
    {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
    },
  );
  if (!response.ok) {
    throw new Error(`GitHub API ${path}: ${response.status}`);
  }
  return response.json();
};

// The latest check run of each name (GitHub's default filter), 100 at most.
const checkRuns = async (sha: string) => {
  const body = (await api(`commits/${sha}/check-runs?per_page=100`)) as {
    total_count: number;
    check_runs: CheckRun[];
  };
  return {
    runs: body.check_runs,
    complete: body.total_count === body.check_runs.length,
  };
};

// The latest status of each context.
const statuses = async (sha: string) => {
  const body = (await api(`commits/${sha}/status?per_page=100`)) as {
    total_count: number;
    statuses: (CommitStatus & { description: string | null })[];
  };
  return {
    statuses: body.statuses,
    complete: body.total_count === body.statuses.length,
  };
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// One light request every 30 seconds until `read` returns a value, or null
// once the time cap is reached.
const until = async <T>(
  read: () => Promise<T | null>,
  capMinutes: number,
): Promise<T | null> => {
  const deadline = Date.now() + capMinutes * 60_000;
  for (;;) {
    const value = await read();
    if (value !== null) return value;
    if (Date.now() + 30_000 > deadline) return null;
    await wait(30_000);
  }
};

const postLighthouse = (
  head: string,
  conclusion: string,
  title: string,
  summary: string,
) =>
  api("check-runs", {
    method: "POST",
    body: JSON.stringify({
      name: "Lighthouse",
      head_sha: head,
      status: "completed",
      conclusion,
      output: { title, summary },
    }),
  });

// Vercel's outcome for one commit: its latest statuses and whether it has a
// GitHub deployment (Vercel creates one only for a build it ran).
const vercelOf = async (sha: string) => {
  const [{ statuses: list }, deployments] = await Promise.all([
    statuses(sha),
    api(`deployments?sha=${sha}&per_page=1`) as Promise<unknown[]>,
  ]);
  return vercelOutcome(list, deployments.length);
};

/**
 * The commit whose Lighthouse result stands for `head` when Vercel skipped
 * it: the nearest first-parent ancestor that Vercel built, as long as every
 * commit from there to `head` changes only Markdown, so its code is the
 * head's. Null when a code change comes first or nothing was built.
 */
export const measuredAncestor = async (
  head: string,
  outcomeOf: (sha: string) => Promise<ReturnType<typeof vercelOutcome>>,
  cwd?: string,
  depth = 50,
): Promise<string | null> => {
  const ancestors = execFileSync(
    "git",
    ["rev-list", "--first-parent", `--max-count=${depth}`, head, "--"],
    { cwd, encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean)
    .slice(1);
  for (const candidate of ancestors) {
    if (!isDocsOnly(rangeFiles(candidate, head, cwd))) return null;
    if ((await outcomeOf(candidate)) === "built") return candidate;
  }
  return null;
};

const standIn = async (head: string) => {
  const outcome = await until(async () => {
    const result = await vercelOf(head);
    return result === "pending" ? null : result;
  }, 20);
  if (outcome === null) {
    console.error(
      "docs-only: Vercel did not report on the head commit in 20 minutes.",
    );
    process.exit(1);
  }
  if (outcome !== "skipped") {
    console.log(
      `docs-only: Vercel ${outcome} the head commit, so no stand-in.`,
    );
    return;
  }
  const measured = await measuredAncestor(head, vercelOf);
  // Lighthouse on that commit can still be measuring its deployment.
  const conclusion = measured
    ? await until(
        async () => lighthouseConclusion((await checkRuns(measured)).runs),
        30,
      )
    : null;
  if (measured && conclusion === "success") {
    await postLighthouse(
      head,
      "success",
      "Not measured: documentation only since the last preview",
      `Every commit since ${measured} changes only .md files, so Vercel skipped the preview, and Lighthouse passed on ${measured}, which has the same code (issue #106).`,
    );
  } else {
    await postLighthouse(
      head,
      "failure",
      "Not measured: no passing Lighthouse result for this code",
      measured
        ? `Vercel skipped the preview, since only .md files changed since ${measured}, but Lighthouse on ${measured} is ${conclusion ?? "missing after 30 minutes"}. Re-run it there, then re-run this job, or push a code change (issue #106).`
        : "Vercel skipped the preview, but no earlier commit with the same code has a preview. Push a code change (issue #106).",
    );
  }
  console.log(
    `docs-only: posted Lighthouse on ${head}, from ${measured ?? "no measured commit"} (${conclusion ?? "none"}).`,
  );
};

const vercel = () => {
  const target = vercelBase(process.env);
  if (!target) {
    console.log("docs-only: no base to compare with, building.");
    process.exit(1);
  }
  // Vercel's clone is shallow and may lack the base commit: one fetch of
  // that single commit from the public repository.
  execFileSync(
    "git",
    ["fetch", "--quiet", "--no-tags", "--depth=1", target.url, target.ref],
    { stdio: "inherit" },
  );
  const files = changedFiles("FETCH_HEAD", "HEAD");
  if (isDocsOnly(files)) {
    console.log(
      `docs-only: ${files.length} changed file(s) since ${target.ref}, documentation only.`,
    );
    process.exit(0);
  }
  const preview = vercelPreviewPrevious(process.env);
  if (!preview) {
    console.log(`docs-only: code changed since ${target.ref}, building.`);
    process.exit(1);
  }
  // Fifty commits of the head's history, so the last deployment is in reach;
  // further back, the ancestry check throws and the build goes ahead.
  execFileSync(
    "git",
    ["fetch", "--quiet", "--no-tags", "--depth=50", preview.url, preview.head],
    { stdio: "inherit" },
  );
  const since = rangeFiles(preview.previous, preview.head);
  const docsOnly = isDocsOnly(since);
  console.log(
    `docs-only: ${since.length} file(s) changed since the last deployment ${preview.previous}, ${
      docsOnly ? "documentation only" : "code changed"
    }.`,
  );
  process.exit(docsOnly ? 0 : 1);
};

const main = async () => {
  const args = process.argv.slice(2);
  if (args[0] === "--vercel") return vercel();
  if (args[0] === "--checks-passed" && args[1]) {
    const [runs, list] = await Promise.all([
      checkRuns(args[1]),
      statuses(args[1]),
    ]);
    const result = checksPassed(
      runs.runs,
      list.statuses,
      runs.complete && list.complete,
    );
    console.log(`docs-only: checks on ${args[1]}: ${result.reason}.`);
    process.exit(result.passed ? 0 : 1);
  }
  if (args[0] === "--stand-in" && args[1]) return standIn(args[1]);
  if (args.length !== 2 || !args[0] || !args[1]) {
    console.error(
      "Usage: docs-only.ts <base> <head> | --vercel | --checks-passed <sha> | --stand-in <head>",
    );
    process.exit(2);
  }
  const files = changedFiles(args[0], args[1]);
  const docsOnly = isDocsOnly(files);
  console.log(
    `docs-only: ${files.length} changed file(s), ${
      docsOnly ? "documentation only" : "code changed"
    }.`,
  );
  process.exit(docsOnly ? 0 : 1);
};

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(
      `docs-only: ${error instanceof Error ? error.message : error}`,
    );
    process.exit(1);
  });
}
