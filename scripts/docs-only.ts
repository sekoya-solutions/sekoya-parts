// Decides whether a change is documentation only: every file whose content
// differs between two commits ends in ".md". The two trees are compared
// directly, with no merge base, so the answer needs no history: when it is
// "documentation only", the code of the head commit is exactly the code of
// the base commit, which has already been built and tested.
// - Issue #91: a pull request compared with its base skips the heavy checks.
// - Issue #106, revised by issue #123: a push compared with the pull
//   request's previous head. A documentation-only push cancels nothing, and
//   its heavy jobs conclude like the same jobs on the previous head, waiting
//   for them. A code push cancels the pull request's older CI and Lighthouse
//   runs, which are useless, and any run that starts on a commit already
//   followed by a code change cancels itself.
// - Vercel skips a preview when every commit since a built or building
//   ancestor changes only Markdown; CI then copies that ancestor's Lighthouse
//   result and scores onto the new head.
//
// Any error means the change touches code, so a failure never skips a check
// or a build, and never cancels a run.
//
// Usage:
//   node scripts/docs-only.ts <base> <head>   exit 0 when documentation only
//                                             (two commits already fetched)
//   node scripts/docs-only.ts --vercel        Vercel's ignoreCommand: fetches
//                                             the base from GitHub itself
//   node scripts/docs-only.ts --ci-run <sha>  exit 0 when <sha> has a CI run
//   node scripts/docs-only.ts --mirror <job> <previous>
//                                             waits for job <job> on
//                                             <previous>'s CI run, and exits
//                                             with its outcome
//   node scripts/docs-only.ts --cancel-stale <pull> <head> <branch>
//                                             cancels the pull request's
//                                             unfinished CI and Lighthouse
//                                             runs of other commits
//   node scripts/docs-only.ts --superseded <sha> [<pull>]
//                                             cancels this run when a code
//                                             change follows <sha> on its
//                                             open pull request
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

export type CheckRun = {
  name: string;
  status: string;
  conclusion: string | null;
  output?: { title?: string | null; summary?: string | null };
  details_url?: string | null;
};
export type CommitStatus = { context: string; state: string };

/**
 * What Vercel did with a commit, from its "Vercel" status and the number of
 * GitHub deployments it created. Vercel sets the status to pending when a
 * build starts, before its Ignored Build Step decides, and creates the GitHub
 * deployment only once the build is done. A skipped build is a success status
 * that names the Ignored Build Step and has no deployment; Vercel does not
 * document that wording, so anything else counts as built, and the real
 * Lighthouse runs. "unreported" when Vercel has posted no status: not yet,
 * on a head commit, or never, on a commit that was not a push's tip.
 */
export const vercelOutcome = (
  statuses: readonly (CommitStatus & { description?: string | null })[],
  deployments: number,
): "unreported" | "pending" | "skipped" | "built" | "failed" => {
  const vercel = statuses.find((status) => status.context === "Vercel");
  if (!vercel) return "unreported";
  if (vercel.state === "pending") return "pending";
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

/** The per-page checks that the Lighthouse workflow publishes (issue #96). */
export const scoreChecks = (runs: readonly CheckRun[]) =>
  runs.filter(
    (run) =>
      run.name.startsWith("Lighthouse scores · ") && run.status === "completed",
  );

export type WorkflowRun = { id: number; head_sha: string; status: string };

/**
 * The runs that a code push on `head` makes useless (issue #123): every run
 * not yet completed on another commit, among `shas` when given (the pull
 * request's commits, for the Lighthouse workflow, whose runs are not tied to
 * a branch).
 */
export const staleRuns = (
  runs: readonly WorkflowRun[],
  head: string,
  shas?: ReadonlySet<string>,
) =>
  runs.filter(
    (run) =>
      run.status !== "completed" &&
      run.head_sha !== head &&
      (!shas || shas.has(run.head_sha)),
  );

export type Job = { name: string; status: string; conclusion: string | null };

/**
 * A job of the previous head's CI run, as a documentation-only push mirrors
 * it (issue #123): "pass" when it succeeded or was skipped (its code equals
 * the base's), "fail" on any other end, "pending" while it is queued or
 * running, and "missing" when the run ended without it.
 */
export const jobVerdict = (
  jobs: readonly Job[],
  name: string,
  runCompleted: boolean,
): "pass" | "fail" | "pending" | "missing" => {
  const job = jobs.find((candidate) => candidate.name === name);
  if (!job) return runCompleted ? "missing" : "pending";
  if (job.status !== "completed") return "pending";
  return job.conclusion === "success" || job.conclusion === "skipped"
    ? "pass"
    : "fail";
};

// GitHub's REST API, with the workflow's own token when there is one (Vercel's
// build has none: the repository is public).
const api = async (path: string, init?: RequestInit) => {
  const repository =
    process.env.GITHUB_REPOSITORY ??
    (process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG
      ? `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}`
      : undefined);
  if (!repository) throw new Error("GITHUB_REPOSITORY missing");
  const token = process.env.GITHUB_TOKEN;
  const response = await fetch(
    `https://api.github.com/repos/${repository}/${path}`,
    {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
    },
  );
  if (!response.ok) {
    throw new Error(`GitHub API ${path}: ${response.status}`);
  }
  // A cancel request answers 202 with an empty body.
  const text = await response.text();
  return text ? JSON.parse(text) : {};
};

// The latest check run of each name (GitHub's default filter), 100 at most.
const checkRuns = async (sha: string) => {
  const body = (await api(`commits/${sha}/check-runs?per_page=100`)) as {
    total_count: number;
    check_runs: CheckRun[];
  };
  return body.check_runs;
};

// The latest status of each context.
const statuses = async (sha: string) => {
  const body = (await api(`commits/${sha}/status?per_page=100`)) as {
    statuses: (CommitStatus & { description: string | null })[];
  };
  return body.statuses;
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

const postCheck = (
  head: string,
  name: string,
  conclusion: string,
  title: string,
  summary: string,
  detailsUrl?: string | null,
) =>
  api("check-runs", {
    method: "POST",
    body: JSON.stringify({
      name,
      head_sha: head,
      status: "completed",
      conclusion,
      ...(detailsUrl ? { details_url: detailsUrl } : {}),
      output: { title, summary },
    }),
  });

// Vercel's outcome for one commit: its latest statuses and whether it has a
// GitHub deployment (Vercel creates one only for a build it ran).
const vercelOf = async (sha: string) => {
  const [list, deployments] = await Promise.all([
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

/**
 * Wraps a Vercel outcome lookup so that a build still running is waited for
 * (issue #123): a documentation commit pushed during its code commit's build
 * then finds that build. `wait` returns null while pending, and the cap
 * returns "pending", which measuredAncestor passes over.
 */
export const settled =
  (
    outcomeOf: (sha: string) => Promise<ReturnType<typeof vercelOutcome>>,
    wait: typeof until,
    capMinutes: number,
  ) =>
  async (sha: string) =>
    (await wait(async () => {
      const outcome = await outcomeOf(sha);
      return outcome === "pending" ? null : outcome;
    }, capMinutes)) ?? "pending";

const standIn = async (head: string) => {
  const outcome = await until(async () => {
    const result = await vercelOf(head);
    return result === "pending" || result === "unreported" ? null : result;
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
  const measured = await measuredAncestor(head, settled(vercelOf, until, 20));
  // Lighthouse on that commit can still be measuring its deployment.
  const conclusion = measured
    ? await until(
        async () => lighthouseConclusion(await checkRuns(measured)),
        30,
      )
    : null;
  if (measured && conclusion === "success") {
    // Each page's scores first, so the head's checks show them (issue #123).
    for (const run of scoreChecks(await checkRuns(measured))) {
      await postCheck(
        head,
        run.name,
        run.conclusion ?? "neutral",
        run.output?.title ?? "",
        `Measured on ${measured}, which has the same code.\n\n${run.output?.summary ?? ""}`,
        run.details_url,
      );
    }
    await postCheck(
      head,
      "Lighthouse",
      "success",
      "Not measured: documentation only since the last preview",
      `Every commit since ${measured} changes only .md files, so Vercel skipped the preview, and Lighthouse passed on ${measured}, which has the same code (issues #106 and #123).`,
    );
  } else {
    await postCheck(
      head,
      "Lighthouse",
      "failure",
      "Not measured: no passing Lighthouse result for this code",
      measured
        ? `Vercel skipped the preview, since only .md files changed since ${measured}, but Lighthouse on ${measured} is ${conclusion ?? "missing after 30 minutes"}. Re-run it there, then re-run this job, or push a code change (issue #106).`
        : "Vercel skipped the preview, but no earlier commit with the same code has a built preview. Push a code change (issue #106).",
    );
  }
  console.log(
    `docs-only: posted Lighthouse on ${head}, from ${measured ?? "no measured commit"} (${conclusion ?? "none"}).`,
  );
};

// The newest CI run of a commit, from a pull request event.
const ciRun = async (sha: string) => {
  const body = (await api(
    `actions/workflows/ci.yml/runs?event=pull_request&head_sha=${sha}&per_page=10`,
  )) as { workflow_runs: WorkflowRun[] };
  return body.workflow_runs[0] ?? null;
};

// Issue #123: a documentation-only push concludes each heavy job like the
// same job on the previous head, waiting while it runs. A job that is cut by
// its timeout also ends this wait: the cap exceeds every job's timeout.
const mirror = async (name: string, previous: string) => {
  const verdict = await until(async () => {
    const run = await ciRun(previous);
    if (!run) return "missing" as const;
    const body = (await api(`actions/runs/${run.id}/jobs?per_page=100`)) as {
      jobs: Job[];
    };
    const result = jobVerdict(body.jobs, name, run.status === "completed");
    return result === "pending" ? null : result;
  }, 45);
  if (verdict === "pass") {
    console.log(
      `docs-only: "${name}" passed on ${previous}, which has the same code.`,
    );
    return;
  }
  console.error(
    `docs-only: "${name}" on ${previous}, which has the same code, is ${verdict ?? "still running after 45 minutes"}. Re-run it there, then re-run this job, or push a code change.`,
  );
  process.exit(1);
};

// Issue #123: a code push cancels the pull request's unfinished CI runs on
// other commits, and the Lighthouse runs of its other commits. A run that has
// just finished answers 409, which is logged and passed over.
const cancelStale = async (pull: string, head: string, branch: string) => {
  const [ci, lighthouse, commits] = await Promise.all([
    api(
      `actions/workflows/ci.yml/runs?event=pull_request&branch=${encodeURIComponent(branch)}&per_page=50`,
    ) as Promise<{ workflow_runs: WorkflowRun[] }>,
    api(
      "actions/workflows/lighthouse.yml/runs?event=deployment_status&per_page=50",
    ) as Promise<{ workflow_runs: WorkflowRun[] }>,
    api(`pulls/${pull}/commits?per_page=100`) as Promise<{ sha: string }[]>,
  ]);
  const shas = new Set(commits.map((commit) => commit.sha));
  const stale = [
    ...staleRuns(ci.workflow_runs, head),
    ...staleRuns(lighthouse.workflow_runs, head, shas),
  ];
  for (const run of stale) {
    try {
      await api(`actions/runs/${run.id}/cancel`, { method: "POST" });
      console.log(`docs-only: cancelled run ${run.id} on ${run.head_sha}.`);
    } catch (error) {
      console.log(
        `docs-only: run ${run.id} not cancelled (${error instanceof Error ? error.message : error}).`,
      );
    }
  }
  if (stale.length === 0) console.log("docs-only: no stale run to cancel.");
};

/**
 * The head that makes `sha` stale (issue #123): the first of `heads` other
 * than `sha` whose code differs from it. Comparing needs both commits
 * fetched; a failed comparison is not a code change, so the run goes on.
 */
export const supersedingHead = (
  sha: string,
  heads: readonly string[],
  compare: (base: string, head: string) => readonly string[],
) =>
  heads.find((head) => {
    if (head === sha) return false;
    try {
      return !isDocsOnly(compare(sha, head));
    } catch {
      return false;
    }
  }) ?? null;

// The heads of the open pull requests holding `sha`, or of one pull request.
const openHeads = async (sha: string, pull?: string) => {
  if (pull) {
    const body = (await api(`pulls/${pull}`)) as {
      state: string;
      head: { sha: string };
    };
    return body.state === "open" ? [body.head.sha] : [];
  }
  const pulls = (await api(`commits/${sha}/pulls`)) as {
    state: string;
    head: { sha: string };
  }[];
  return pulls.filter((p) => p.state === "open").map((p) => p.head.sha);
};

const superseded = async (sha: string, pull?: string) => {
  let heads: string[];
  try {
    heads = await openHeads(sha, pull);
  } catch (error) {
    console.log(
      `docs-only: open heads unknown (${error instanceof Error ? error.message : error}), going on.`,
    );
    return;
  }
  const head = supersedingHead(sha, heads, (base, other) => {
    execFileSync(
      "git",
      ["fetch", "--quiet", "--no-tags", "--depth=1", "origin", other],
      { stdio: "inherit" },
    );
    return changedFiles(base, other);
  });
  if (!head) {
    console.log(`docs-only: ${sha} is not followed by a code change.`);
    return;
  }
  const runId = process.env.GITHUB_RUN_ID;
  if (!runId) throw new Error("GITHUB_RUN_ID missing");
  console.log(
    `docs-only: ${head} changes code after ${sha}, so this run is cancelled.`,
  );
  await api(`actions/runs/${runId}/cancel`, { method: "POST" });
  // The runner stops this step once the cancellation lands, which the script
  // cannot observe from inside: it waits for it, capped at five minutes.
  await wait(5 * 60_000);
  console.error("docs-only: the cancellation did not land in five minutes.");
  process.exit(1);
};

// Issue #123: Vercel creates no GitHub deployment until a build ends, so a
// commit still building is found through its pending "Vercel" status, and
// counts as built: if that build fails, the stand-in reports it. A commit
// without a status was never a push's tip, so never built.
const vercelStatusOutcome = async (sha: string) => {
  const outcome = vercelOutcome(await statuses(sha), 0);
  return outcome === "pending" ? "built" : outcome;
};

const vercel = async () => {
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
  const head = process.env.VERCEL_GIT_COMMIT_SHA;
  if (process.env.VERCEL_ENV !== "preview" || !head) {
    console.log(`docs-only: code changed since ${target.ref}, building.`);
    process.exit(1);
  }
  // Fifty commits of the head's history, so the last deployment is in reach;
  // further back, the ancestry check throws and the build goes ahead.
  execFileSync(
    "git",
    ["fetch", "--quiet", "--no-tags", "--depth=50", target.url, head],
    { stdio: "inherit" },
  );
  if (preview) {
    // After a force-push, the last deployment is no ancestor and this throws:
    // the ancestor search below still applies.
    let since: string[] | null = null;
    try {
      since = rangeFiles(preview.previous, preview.head);
    } catch {
      console.log(
        `docs-only: ${preview.previous} is not an ancestor of the head.`,
      );
    }
    if (since && isDocsOnly(since)) {
      console.log(
        `docs-only: ${since.length} file(s) changed since the last deployment ${preview.previous}, documentation only.`,
      );
      process.exit(0);
    }
  }
  // GitHub's API without a token, as Vercel's build has none; its per-address
  // limit can refuse the request, and any error builds.
  const building = await measuredAncestor(head, vercelStatusOutcome);
  console.log(
    building
      ? `docs-only: only .md files changed since ${building}, built or building, documentation only.`
      : "docs-only: code changed since the last built or building commit, building.",
  );
  process.exit(building ? 0 : 1);
};

const main = async () => {
  const args = process.argv.slice(2);
  if (args[0] === "--vercel") return vercel();
  if (args[0] === "--ci-run" && args[1]) {
    const run = await ciRun(args[1]);
    console.log(
      `docs-only: ${args[1]} has ${run ? `CI run ${run.id}` : "no CI run"}.`,
    );
    process.exit(run ? 0 : 1);
  }
  if (args[0] === "--mirror" && args[1] && args[2])
    return mirror(args[1], args[2]);
  // Cancelling only saves time: an error there lets the run go on.
  const goOn = (error: unknown) =>
    console.log(
      `docs-only: nothing cancelled (${error instanceof Error ? error.message : error}).`,
    );
  if (args[0] === "--cancel-stale" && args[1] && args[2] && args[3])
    return cancelStale(args[1], args[2], args[3]).catch(goOn);
  if (args[0] === "--superseded" && args[1])
    return superseded(args[1], args[2]).catch(goOn);
  if (args[0] === "--stand-in" && args[1]) return standIn(args[1]);
  if (args.length !== 2 || !args[0] || !args[1]) {
    console.error(
      "Usage: docs-only.ts <base> <head> | --vercel | --ci-run <sha> | --mirror <job> <previous> | --cancel-stale <pull> <head> <branch> | --superseded <sha> [<pull>] | --stand-in <head>",
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
