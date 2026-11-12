// Pure helpers for the Lighthouse check (docs/adr/0004-testing-and-ci.md,
// issue #59): medians, the redaction of the bypass header, and the texts of
// the job summary, the "Lighthouse scores" check and the pull request comment.
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

/** The figures of one measured address, across its runs. */
export type Figures = {
  path: string;
  htmlBytes: number;
  cache: string;
  /** Scores from 0 to 100, one per run, in run order. */
  scores: Record<CategoryId, number[]>;
  elements: number | null;
};

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

/** The figures as a Markdown table: medians, then each run's performance. */
export function scoresTable(figures: Figures[], runs: number) {
  const lines = [
    `Median of ${runs} mobile runs per address, as PageSpeed Insights measures.`,
    "",
    `| Address | ${CATEGORIES.map(([, name]) => name).join(" | ")} | Performance runs | HTML bytes | Elements |`,
    `| --- | ${CATEGORIES.map(() => "---:").join(" | ")} | --- | ---: | ---: |`,
  ];
  for (const f of figures) {
    lines.push(
      `| \`${f.path}\` | ${medians(f).join(" | ")} | ${f.scores.performance.join(", ")} | ${f.htmlBytes} | ${f.elements ?? "?"} |`,
    );
  }
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
    "Vercel answers previews with `X-Robots-Tag: noindex`, which lowers Lighthouse's SEO score; production does not send it.",
    "",
  ].join("\n");
}
