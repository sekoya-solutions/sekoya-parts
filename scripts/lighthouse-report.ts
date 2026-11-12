// Pure helpers for the Lighthouse check (docs/adr/0004-testing-and-ci.md,
// issues #59 and #61): the warm-up split, medians and the 95 threshold, the
// redaction of the bypass header, and the texts of the job summary, the
// "Lighthouse scores" check and the pull request comment.
// No input or output here, so Vitest tests it directly.
import { ReportGenerator } from "lighthouse/report/generator/report-generator.js";

/** The bypass header Lighthouse sends to reach a protected preview. */
export const BYPASS_HEADER = "x-vercel-protection-bypass";

/** The four categories PageSpeed Insights shows, in its order. */
export const CATEGORIES = [
  ["performance", "Performance"],
  ["accessibility", "Accessibility"],
  ["best-practices", "Best practices"],
  ["seo", "SEO"],
] as const;

export type CategoryId = (typeof CATEGORIES)[number][0];

/**
 * SEO audits left out on previews, since they fail only because a preview is
 * protected (owner decision on PR #63): Vercel answers previews with
 * `X-Robots-Tag: noindex`, and Lighthouse fetches robots.txt without the
 * bypass header, so it gets Vercel's sign-in redirect. Phase 3 tests the
 * site's own robots.txt and indexing rules (docs/adr/0011-languages-and-seo.md).
 */
export const PREVIEW_SKIPPED_AUDITS = ["is-crawlable", "robots-txt"];

/**
 * The requests a run made to vercel.live, where Vercel's preview toolbar
 * comes from. None is expected: the toolbar sets a third-party cookie, and
 * the owner turned it off for pre-production deployments in the project's
 * settings (PR #63). The documented x-vercel-skip-toolbar header did not keep
 * it out of Lighthouse's browser (run 43263146763).
 */
export function toolbarRequests(lhr: {
  audits: Record<string, { details?: { items?: unknown[] } } | undefined>;
}) {
  const items = lhr.audits["network-requests"]?.details?.items ?? [];
  return items
    .map((item) => (item as { url?: string }).url ?? "")
    .filter(
      (url) => URL.canParse(url) && new URL(url).hostname === "vercel.live",
    );
}

const SKIPPED_NOTE =
  "On previews, the SEO score leaves out `is-crawlable` and `robots-txt`, which fail only because a preview is protected: Vercel's `X-Robots-Tag: noindex` header, and its sign-in redirect on robots.txt.";

/** The figures of one measured address, across its runs. */
export type Figures = {
  path: string;
  htmlBytes: number;
  cache: string;
  /** The discarded warm-up run's performance score, from 0 to 100. */
  warmUp: number | null;
  /** Scores from 0 to 100, one per measured run, in run order. */
  scores: Record<CategoryId, number[]>;
  elements: number | null;
};

/**
 * The lowest median mobile performance score a measured address may have
 * (ADR 0004). Below it, the "Lighthouse" check fails.
 */
export const MIN_PERFORMANCE = 95;

/**
 * Splits Lighthouse results by address, in the order they ran: the first run
 * of each address is the warm-up, which is not counted. Lighthouse CI starts a
 * new Chrome for every run, and the first one on a fresh runner is slower: in
 * run 43272369772 it scored 92 against 100, with the same requests and a
 * benchmark index of 1,996 against about 2,950 (issue #61).
 */
export function splitWarmUp<
  T extends { requestedUrl: string; fetchTime: string },
>(reports: T[]) {
  const byPath = new Map<string, T[]>();
  for (const report of [...reports].sort((a, b) =>
    a.fetchTime.localeCompare(b.fetchTime),
  )) {
    const path = new URL(report.requestedUrl).pathname;
    byPath.set(path, [...(byPath.get(path) ?? []), report]);
  }
  const split = new Map<string, { warmUp: T; runs: T[] }>();
  for (const [path, [warmUp, ...runs]] of byPath)
    if (warmUp) split.set(path, { warmUp, runs });
  return split;
}

/** The addresses whose median performance is below the threshold. */
export function belowThreshold(figures: Figures[], min = MIN_PERFORMANCE) {
  return figures
    .map((f) => ({ path: f.path, median: median(f.scores.performance) }))
    .filter((f) => f.median < min);
}

/** One line saying whether every address passed, and which did not. */
export function gateText(figures: Figures[], min = MIN_PERFORMANCE) {
  const failed = belowThreshold(figures, min);
  if (failed.length === 0)
    return `Passed: every address has a median performance of at least ${min}.`;
  return `Failed: ${failed
    .map((f) => `\`${f.path}\` has a median performance of ${f.median}`)
    .join("; ")}, below ${min}.`;
}

/** Where the measuring script leaves the reports and the figures. */
export const REPORTS_DIR = "lighthouse-reports";
export const FIGURES_FILE = "lighthouse-figures.json";

/** Marks the one comment this check keeps up to date on a pull request. */
export const COMMENT_MARKER = "<!-- lighthouse-scores -->";

export const median = (values: number[]) => {
  if (values.length === 0) throw new Error("median of no values");
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
};

type Report = { configSettings?: { extraHeaders?: unknown } };

/**
 * A copy of a Lighthouse result without the headers Lighthouse sent: it copies
 * its settings, the bypass header included, into every report.
 */
export function redact<T extends Report>(lhr: T): T {
  const copy = structuredClone(lhr);
  if (copy.configSettings) delete copy.configSettings.extraHeaders;
  return copy;
}

/**
 * Throws if a text to be saved still holds the secret or the bypass header's
 * name. The name is checked too, since its value always comes with it.
 */
export function assertNoSecret(text: string, secret: string, what: string) {
  if (!secret) throw new Error("No secret given to check against.");
  if (text.includes(secret))
    throw new Error(`${what} holds the bypass secret; nothing is saved.`);
  if (text.toLowerCase().includes(BYPASS_HEADER))
    throw new Error(`${what} holds the bypass header; nothing is saved.`);
}

/** The JSON and HTML reports of one run, redacted, then checked. */
export function reportFiles<T extends Report>(lhr: T, secret: string) {
  const clean = redact(lhr);
  const json = JSON.stringify(clean);
  const html = ReportGenerator.generateReportHtml(clean as never);
  assertNoSecret(json, secret, "The JSON report");
  assertNoSecret(html, secret, "The HTML report");
  return { json, html };
}

const medians = (f: Figures) => CATEGORIES.map(([id]) => median(f.scores[id]));

/** The "Lighthouse scores" check's title, which the checks list shows. */
export function checkTitle(figures: Figures[]) {
  return figures
    .map((f) => {
      const [performance, accessibility, bestPractices, seo] = medians(f);
      const scores = `Performance ${performance}, accessibility ${accessibility}, best practices ${bestPractices}, SEO ${seo}`;
      return figures.length > 1 ? `${f.path}: ${scores}` : scores;
    })
    .join("; ");
}

/**
 * The figures as a Markdown table: medians, then each run's performance,
 * then the threshold's verdict.
 */
export function scoresTable(figures: Figures[], runs: number) {
  const lines = [
    `Median of ${runs} mobile runs per address, as PageSpeed Insights measures, after one warm-up run that is not counted.`,
    "",
    `| Address | ${CATEGORIES.map(([, name]) => name).join(" | ")} | Performance runs | Warm-up | HTML bytes | Elements |`,
    `| --- | ${CATEGORIES.map(() => "---:").join(" | ")} | --- | ---: | ---: | ---: |`,
  ];
  for (const f of figures) {
    lines.push(
      `| \`${f.path}\` | ${medians(f).join(" | ")} | ${f.scores.performance.join(", ")} | ${f.warmUp ?? "?"} | ${f.htmlBytes} | ${f.elements ?? "?"} |`,
    );
  }
  lines.push("", `**${gateText(figures)}**`, "", SKIPPED_NOTE);
  return `${lines.join("\n")}\n`;
}

/** The pull request comment, replaced in place on each preview. */
export function commentBody(
  figures: Figures[],
  runs: number,
  sha: string,
  runUrl: string,
  reportsUrl: string | null,
) {
  const reports = reportsUrl
    ? `[Download the HTML and JSON reports](${reportsUrl}) (any signed-in GitHub user, 30 days).`
    : "The reports could not be uploaded; see the run.";
  return [
    COMMENT_MARKER,
    "### Lighthouse",
    "",
    `Preview of \`${sha.slice(0, 7)}\`, [run](${runUrl}).`,
    "",
    scoresTable(figures, runs),
    reports,
    "",
  ].join("\n");
}
