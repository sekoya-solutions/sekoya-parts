// Runs Lighthouse CI against a deployed preview (docs/adr/0004-testing-and-ci.md,
// issues #57 and #59). It writes the figures of each address to the job
// summary and to lighthouse-figures.json, and the reports of every run to
// lighthouse-reports/, which the workflow uploads.
//
// Usage: node scripts/lighthouse.ts <base URL> <path>...
// Reads the bypass secret from VERCEL_AUTOMATION_BYPASS_SECRET. The secret is
// sent as a header only, never printed or put in a URL. Lighthouse copies its
// settings, headers included, into every report, so each report is redacted
// and checked for the secret before it is saved, and Lighthouse CI's own
// reports are deleted at the end.
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CATEGORIES,
  type CategoryId,
  FIGURES_FILE,
  type Figures,
  REPORTS_DIR,
  reportFiles,
  scoresTable,
} from "./lighthouse-report.ts";

const RUNS = 5;
const LHCI_DIR = ".lighthouseci";

type Report = {
  requestedUrl: string;
  fetchTime: string;
  runtimeError?: { message: string };
  configSettings: { extraHeaders?: unknown };
  categories: Record<CategoryId, { score: number | null } | undefined>;
  audits: Record<
    string,
    { details?: { debugData?: { totalElements?: number } } }
  >;
};

const [base, ...paths] = process.argv.slice(2);
const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
if (!base || paths.length === 0) {
  console.error("Usage: node scripts/lighthouse.ts <base URL> <path>...");
  process.exit(2);
}
if (!secret) {
  console.error("VERCEL_AUTOMATION_BYPASS_SECRET is not set.");
  process.exit(2);
}
const headers = { "x-vercel-protection-bypass": secret };

// Nothing from an earlier run is kept or uploaded.
rmSync(REPORTS_DIR, { recursive: true, force: true });
rmSync(FIGURES_FILE, { force: true });

// The warm-up request: one per address, which also gives the uncompressed
// HTML size (fetch decompresses the body). A mitigation stops everything at
// once, with no retry (AGENTS.md, section 2).
const figures: Figures[] = [];
for (const path of paths) {
  const response = await fetch(new URL(path, base), { headers });
  const html = await response.text();
  const blocked =
    response.status === 403 ||
    response.status === 429 ||
    response.headers.has("retry-after");
  if (blocked) {
    console.error(
      `Stopped: ${path} answered ${response.status}; no retry, no further request.`,
    );
    process.exit(1);
  }
  if (response.status !== 200) {
    console.error(`Stopped: ${path} answered ${response.status}.`);
    process.exit(1);
  }
  figures.push({
    path,
    htmlBytes: Buffer.byteLength(html),
    cache: response.headers.get("x-vercel-cache") ?? "",
    scores: {
      performance: [],
      accessibility: [],
      "best-practices": [],
      seo: [],
    },
    elements: null,
  });
}

// Inside this try, failures throw rather than exit, so the finally block
// always deletes the configuration, which holds the secret.
// Lighthouse's default settings are the mobile ones PageSpeed Insights uses:
// a mobile screen and simulated throttling.
const configDir = mkdtempSync(join(tmpdir(), "lhci-"));
const configFile = join(configDir, "lighthouserc.json");
// Reports are written here first, and moved to REPORTS_DIR only once every
// one of them has passed the secret check.
const staging = mkdtempSync(join(tmpdir(), "lighthouse-reports-"));
rmSync(LHCI_DIR, { recursive: true, force: true });
try {
  writeFileSync(
    configFile,
    JSON.stringify({
      ci: {
        collect: {
          url: paths.map((path) => new URL(path, base).href),
          numberOfRuns: RUNS,
          settings: { extraHeaders: headers },
        },
      },
    }),
    { mode: 0o600 },
  );
  const lhci = spawnSync("npx", ["lhci", "collect", `--config=${configFile}`], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (lhci.status !== 0)
    throw new Error(`Lighthouse CI exited with ${lhci.status}.`);

  const reports = readdirSync(LHCI_DIR)
    .filter((file) => file.startsWith("lhr-") && file.endsWith(".json"))
    .map(
      (file) =>
        JSON.parse(readFileSync(join(LHCI_DIR, file), "utf8")) as Report,
    )
    .sort((a, b) => a.fetchTime.localeCompare(b.fetchTime));
  for (const report of reports) {
    const path = new URL(report.requestedUrl).pathname;
    const entry = figures.find((f) => f.path === path);
    if (!entry) continue;
    if (report.runtimeError)
      throw new Error(`${path}: ${report.runtimeError.message}`);
    for (const [id, name] of CATEGORIES) {
      const score = report.categories[id]?.score;
      if (score === null || score === undefined)
        throw new Error(`${path}: no ${name} score.`);
      entry.scores[id].push(Math.round(score * 100));
    }
    // Lighthouse 13 reports the element count in its DOM size insight.
    entry.elements =
      report.audits["dom-size-insight"]?.details?.debugData?.totalElements ??
      entry.elements;

    const run = entry.scores.performance.length;
    const name = `${path.replace(/^\/|\/$/g, "").replace(/\W+/g, "-") || "home"}-run-${run}`;
    const { json, html } = reportFiles(report, secret);
    writeFileSync(join(staging, `${name}.report.json`), json);
    writeFileSync(join(staging, `${name}.report.html`), html);
  }
  for (const f of figures) {
    if (f.scores.performance.length !== RUNS)
      throw new Error(
        `${f.path}: ${f.scores.performance.length} runs instead of ${RUNS}.`,
      );
  }
  mkdirSync(REPORTS_DIR, { recursive: true });
  for (const file of readdirSync(staging))
    copyFileSync(join(staging, file), join(REPORTS_DIR, file));
} finally {
  rmSync(configDir, { recursive: true, force: true });
  rmSync(LHCI_DIR, { recursive: true, force: true });
  rmSync(staging, { recursive: true, force: true });
}

const summary = `### Lighthouse\n\n${scoresTable(figures, RUNS)}`;
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
writeFileSync(FIGURES_FILE, JSON.stringify({ runs: RUNS, figures }));
