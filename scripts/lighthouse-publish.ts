// Publishes the figures of scripts/lighthouse.ts on GitHub (issue #59): a
// "Lighthouse scores" check on the deployed commit, whose title shows the
// medians, and one comment on its open pull request, replaced on each
// preview. It runs after the reports are uploaded, without the bypass secret.
//
// Reads GITHUB_TOKEN, GITHUB_REPOSITORY, DEPLOY_SHA and RUN_URL, and
// REPORTS_URL (the uploaded reports, empty if the upload failed).
import { readFileSync } from "node:fs";
import {
  belowThreshold,
  COMMENT_MARKER,
  checkTitle,
  commentBody,
  FIGURES_FILE,
  type Figures,
  scoresTable,
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

const { runs, figures } = JSON.parse(readFileSync(FIGURES_FILE, "utf8")) as {
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

// The check passes or fails with the 95 threshold (issue #61), like the
// "Lighthouse" job, which is the one required on main.
await github("POST", `/repos/${repo}/check-runs`, {
  name: "Lighthouse scores",
  head_sha: sha,
  status: "completed",
  conclusion: belowThreshold(figures).length > 0 ? "failure" : "success",
  details_url: runUrl,
  output: {
    title: checkTitle(figures),
    summary: `${scoresTable(figures, runs)}\n${reportsUrl ? `[HTML and JSON reports](${reportsUrl})` : "No reports uploaded."}`,
  },
});

// The comment goes only on an open pull request whose head is still this
// commit, so a slower run for an older push does not overwrite a newer one.
type Pull = { number: number; state: string; head: { sha: string } };
type Comment = { id: number; body?: string; user: { login: string } };
const pulls = await github<Pull[]>(
  "GET",
  `/repos/${repo}/commits/${sha}/pulls`,
);
const body = commentBody(figures, runs, sha, runUrl, reportsUrl);
for (const pull of pulls) {
  if (pull.state !== "open" || pull.head.sha !== sha) continue;
  let existing: Comment | undefined;
  for (let page = 1; !existing; page++) {
    const comments = await github<Comment[]>(
      "GET",
      `/repos/${repo}/issues/${pull.number}/comments?per_page=100&page=${page}`,
    );
    existing = comments.find(
      (c) =>
        c.user.login === "github-actions[bot]" &&
        c.body?.startsWith(COMMENT_MARKER),
    );
    if (comments.length < 100) break;
  }
  if (existing)
    await github("PATCH", `/repos/${repo}/issues/comments/${existing.id}`, {
      body,
    });
  else
    await github("POST", `/repos/${repo}/issues/${pull.number}/comments`, {
      body,
    });
  console.log(
    `${existing ? "Updated" : "Posted"} the comment on #${pull.number}.`,
  );
}
