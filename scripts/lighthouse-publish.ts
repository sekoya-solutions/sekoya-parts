// Publishes the figures of scripts/lighthouse.ts on GitHub (issue #59): one
// "Lighthouse scores · <page>" check per measured page on the deployed commit
// (issue #96), whose title shows that page's medians with their symbols, and
// one new comment per measured commit on its open pull request (issue #123),
// never edited. On production (issue #67), the check only: no pull request
// comment. It runs after the reports are uploaded, without the bypass secret.
//
// Reads GITHUB_TOKEN, GITHUB_REPOSITORY, DEPLOY_SHA and RUN_URL, and
// REPORTS_URL (the uploaded reports, empty if the upload failed) and
// PREVIEW_URL (the deployment's own address, empty on production).
import { readFileSync } from "node:fs";
import {
  belowThreshold,
  checkName,
  checkTitle,
  commentBody,
  FIGURES_FILE,
  type Figures,
  scoresTable,
  type Target,
} from "./lighthouse-report.ts";

const env = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
};
const token = env("GITHUB_TOKEN");
const repo = env("GITHUB_REPOSITORY");
const sha = env("DEPLOY_SHA");
const runUrl = env("RUN_URL");
const reportsUrl = process.env.REPORTS_URL || null;
const previewUrl = process.env.PREVIEW_URL || null;

const { target, runs, figures } = JSON.parse(
  readFileSync(FIGURES_FILE, "utf8"),
) as {
  target: Target;
  runs: number;
  figures: Figures[];
};

// Single requests, one after another; a failure stops the step, with no
// retry (AGENTS.md, section 2).
async function github<T>(method: string, path: string, body?: unknown) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok)
    throw new Error(
      `${method} ${path} answered ${response.status}: ${await response.text()}`,
    );
  return (await response.json()) as T;
}

// Each page's check passes or fails with that page's 95 threshold (issue
// #61), like the "Lighthouse" job, which is the one required on main.
// One request per page, one after another: API calls, no extra job or run.
const reports = reportsUrl
  ? `[HTML and JSON reports](${reportsUrl})`
  : "No reports uploaded.";
for (const f of figures)
  await github("POST", `/repos/${repo}/check-runs`, {
    name: checkName(f),
    head_sha: sha,
    status: "completed",
    conclusion: belowThreshold([f]).length > 0 ? "failure" : "success",
    details_url: runUrl,
    output: {
      title: checkTitle(f),
      summary: `${scoresTable([f], runs, target)}\n${reports}`,
    },
  });

// Production's commit is on main, not on a pull request: the check is all.
if (target === "production") process.exit(0);

// One new comment per measured commit, on each open pull request holding it,
// even after later pushes, so measurements can be compared (issue #123). No
// comment is edited. A run on a commit that a code push follows is cancelled,
// by itself when it starts or by that push's CI (scripts/docs-only.ts).
type Pull = { number: number; state: string };
const pulls = await github<Pull[]>(
  "GET",
  `/repos/${repo}/commits/${sha}/pulls`,
);
const body = commentBody(figures, runs, sha, runUrl, reportsUrl, previewUrl);
for (const pull of pulls) {
  if (pull.state !== "open") continue;
  await github("POST", `/repos/${repo}/issues/${pull.number}/comments`, {
    body,
  });
  console.log(`Posted the comment on #${pull.number}.`);
}
