// Runs Lighthouse CI against a deployed preview and writes the figures of each
// address to the job summary (docs/adr/0004-testing-and-ci.md, issue #57).
//
// Usage: node scripts/lighthouse.ts <base URL> <path>...
// Reads the bypass secret from VERCEL_AUTOMATION_BYPASS_SECRET. The secret is
// sent as a header only, never printed or put in a URL. Lighthouse copies its
// settings, headers included, into every report, so the reports are deleted
// at the end and never uploaded.
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RUNS = 5;
const REPORTS_DIR = ".lighthouseci";

type Report = {
  requestedUrl: string;
  runtimeError?: { message: string };
  categories: { performance: { score: number | null } };
  audits: Record<
    string,
    {
      numericValue?: number;
      details?: { debugData?: { totalElements?: number } };
    }
  >;
};

type Figures = {
  path: string;
  status: number;
  htmlBytes: number;
  cache: string;
  scores: number[];
  elements: number | null;
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

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
};

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
    status: response.status,
    htmlBytes: Buffer.byteLength(html),
    cache: response.headers.get("x-vercel-cache") ?? "",
    scores: [],
    elements: null,
  });
}

// Lighthouse's default settings are the mobile ones PageSpeed Insights uses:
// a mobile screen and simulated throttling.
const configDir = mkdtempSync(join(tmpdir(), "lhci-"));
const configFile = join(configDir, "lighthouserc.json");
rmSync(REPORTS_DIR, { recursive: true, force: true });
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
  if (lhci.status !== 0) {
    console.error(`Lighthouse CI exited with ${lhci.status}.`);
    process.exit(1);
  }

  for (const file of readdirSync(REPORTS_DIR)) {
    if (!file.startsWith("lhr-") || !file.endsWith(".json")) continue;
    const report = JSON.parse(
      readFileSync(join(REPORTS_DIR, file), "utf8"),
    ) as Report;
    const path = new URL(report.requestedUrl).pathname;
    const entry = figures.find((f) => f.path === path);
    if (!entry) continue;
    if (report.runtimeError) {
      console.error(`${path}: ${report.runtimeError.message}`);
      process.exit(1);
    }
    const score = report.categories.performance.score;
    if (score === null) {
      console.error(`${path}: no performance score.`);
      process.exit(1);
    }
    entry.scores.push(Math.round(score * 100));
    // Lighthouse 13 reports the element count in its DOM size insight.
    entry.elements =
      report.audits["dom-size-insight"]?.details?.debugData?.totalElements ??
      entry.elements;
  }
} finally {
  rmSync(configDir, { recursive: true, force: true });
  rmSync(REPORTS_DIR, { recursive: true, force: true });
}

const lines = [
  `### Lighthouse, ${RUNS} mobile runs per address`,
  "",
  "| Address | HTML bytes | Cache | Median score | Scores | Elements |",
  "| --- | ---: | --- | ---: | --- | ---: |",
];
for (const f of figures) {
  if (f.scores.length !== RUNS) {
    console.error(`${f.path}: ${f.scores.length} runs instead of ${RUNS}.`);
    process.exit(1);
  }
  lines.push(
    `| \`${f.path}\` | ${f.htmlBytes} | ${f.cache} | ${median(f.scores)} | ${f.scores.join(", ")} | ${f.elements ?? "?"} |`,
  );
}
const summary = `${lines.join("\n")}\n`;
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
