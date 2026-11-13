// Pure helpers for the Lighthouse check (docs/adr/0004-testing-and-ci.md,
// issues #59, #61 and #83): the warm-up split, medians and the minimum scores, the
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
 * What a run measures (issue #67): a protected preview, with the bypass header
 * and without the audits above, or the public production site, with neither.
 */
export type Target = "preview" | "production";

/**
 * The public production address. Vercel's Production deployment_status gives
 * the deployment's own address, which Standard Protection keeps behind a
 * sign-in (a 302 to vercel.com/sso-api), so production is measured here.
 */
export const PRODUCTION_URL = "https://sekoya-parts.vercel.app";

/** The target of a Vercel deployment environment's name, or an error. */
export function targetOf(environment: string): Target {
  if (environment === "Production") return "production";
  if (environment.startsWith("Preview")) return "preview";
  throw new Error(`Unknown deployment environment: ${environment}.`);
}

/**
 * The path a redirect's Location header points to, when it stays on the
 * requested address's origin and is not the same address; otherwise null, so
 * a run never measures another site or loops (issue #73). fetch joins a
 * repeated header with ", ", and Next.js can repeat Location with the same
 * value (e2e/addresses.ts); repeated values must all be the same address.
 */
export function sameOriginPath(
  requested: URL,
  location: string | null,
): string | null {
  if (!location) return null;
  const values = new Set(location.split(", "));
  if (values.size !== 1) return null;
  let target: URL;
  try {
    target = new URL([...values][0] as string, requested);
  } catch {
    return null;
  }
  if (target.origin !== requested.origin) return null;
  const path = `${target.pathname}${target.search}`;
  return path === `${requested.pathname}${requested.search}` ? null : path;
}

/** The audits a target leaves out. */
export const skippedAudits = (target: Target) =>
  target === "preview" ? PREVIEW_SKIPPED_AUDITS : [];

/**
 * Why the public address does not serve the deployed commit, or null when it
 * does. The address moves to a new deployment only once Vercel assigns the
 * domain to it, which Vercel does not document as happening before the
 * deployment's success status; a run that measured the older deployment would
 * put its scores on the wrong commit.
 */
export function commitMismatch(served: string | null, expected: string) {
  if (!served)
    return "the public address sent no commit header; the deployment predates it or the header is missing.";
  if (served !== expected)
    return `the public address serves ${served.slice(0, 7)}, not ${expected.slice(0, 7)}; the domain has not moved to this deployment, or a newer one replaced it.`;
  return null;
}

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

const NOTES: Record<Target, string> = {
  preview:
    "On previews, the SEO score leaves out `is-crawlable` and `robots-txt`, which fail only because a preview is protected: Vercel's `X-Robots-Tag: noindex` header, and its sign-in redirect on robots.txt.",
  production: `Measured on the public address, ${PRODUCTION_URL}, without the bypass header and with every SEO audit, once it served this commit.`,
};

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
 * The lowest median mobile score a measured address may have in each gated
 * category: performance (ADR 0004) and accessibility (ADR 0012, issue #83).
 * Below either, the "Lighthouse" check fails.
 */
export const MIN_SCORES: Partial<Record<CategoryId, number>> = {
  performance: 95,
  accessibility: 95,
};

const categoryName = (id: CategoryId): string =>
  (CATEGORIES.find(([key]) => key === id)?.[1] ?? id).toLowerCase();

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

/** Each address and gated category whose median is below its minimum. */
export function belowThreshold(figures: Figures[], mins = MIN_SCORES) {
  const gated = Object.entries(mins) as [CategoryId, number][];
  return figures.flatMap((f) =>
    gated
      .map(([category, min]) => ({
        path: f.path,
        category,
        median: median(f.scores[category]),
        min,
      }))
      .filter((r) => r.median < r.min),
  );
}

/** One line saying whether every address passed, and which did not. */
export function gateText(figures: Figures[], mins = MIN_SCORES) {
  const failed = belowThreshold(figures, mins);
  if (failed.length === 0) {
    const minimums = (Object.entries(mins) as [CategoryId, number][])
      .map(([category, min]) => `${categoryName(category)} of at least ${min}`)
      .join(" and ");
    return `Passed: every address has a median ${minimums}.`;
  }
  const failures = failed.map(
    (r) =>
      `\`${r.path}\` has a median ${categoryName(r.category)} of ${r.median}, below ${r.min}`,
  );
  return `Failed: ${failures.join("; ")}.`;
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
 * name. The name is checked too, since its value always comes with it. A null
 * secret means a run without one (production), where only the name is checked.
 */
export function assertNoSecret(
  text: string,
  secret: string | null,
  what: string,
) {
  if (secret === "") throw new Error("No secret given to check against.");
  if (secret !== null && text.includes(secret))
    throw new Error(`${what} holds the bypass secret; nothing is saved.`);
  if (text.toLowerCase().includes(BYPASS_HEADER))
    throw new Error(`${what} holds the bypass header; nothing is saved.`);
}

/** The JSON and HTML reports of one run, redacted, then checked. */
export function reportFiles<T extends Report>(lhr: T, secret: string | null) {
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
export function scoresTable(figures: Figures[], runs: number, target: Target) {
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
  lines.push("", `**${gateText(figures)}**`, "", NOTES[target]);
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
    scoresTable(figures, runs, "preview"),
    reports,
    "",
  ].join("\n");
}
