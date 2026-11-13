// Runs Lighthouse CI against a ready Vercel deployment
// (docs/adr/0004-testing-and-ci.md, issues #57, #59, #61 and #67): a preview
// at its own address, or production at its public address. It writes the figures of each address to the job
// summary and to lighthouse-figures.json, and the reports of every run to
// lighthouse-reports/, which the workflow uploads. It exits with 1 when an
// address's median performance or accessibility is below 95, after
// writing all of these.
//
// Usage: node scripts/lighthouse.ts <environment> <deployment URL> <page>=<path>...
// <environment> is Vercel's name for it ("Production", "Preview"...).
// <page> is the template measured, such as home, which names its check.
// On a preview, it reads the bypass secret from VERCEL_AUTOMATION_BYPASS_SECRET.
// The secret is sent as a header only, never printed or put in a URL.
// On production, the secret must not be set: the public address is measured
// as a visitor gets it, through the firewall, once its commit header names
// DEPLOY_SHA. Lighthouse copies its
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
import { COMMIT_HEADER } from "../site/commit.ts";
import {
  belowThreshold,
  CATEGORIES,
  type CategoryId,
  commitMismatch,
  FIGURES_FILE,
  type Figures,
  gateText,
  PREVIEW_SKIPPED_AUDITS,
  PRODUCTION_URL,
  pageArguments,
  REPORTS_DIR,
  reportFiles,
  sameOriginPath,
  scoresTable,
  skippedAudits,
  splitWarmUp,
  targetOf,
  toolbarRequests,
} from "./lighthouse-report.ts";

// Measured runs per address; each address also gets one warm-up run first,
// which is not counted (splitWarmUp).
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
    {
      details?: { debugData?: { totalElements?: number }; items?: unknown[] };
    }
  >;
};

const [environment, deploymentUrl, ...pageArgv] = process.argv.slice(2);
if (!environment || !deploymentUrl || pageArgv.length === 0) {
  console.error(
    "Usage: node scripts/lighthouse.ts <environment> <deployment URL> <page>=<path>...",
  );
  process.exit(2);
}
let pages: ReturnType<typeof pageArguments>;
try {
  pages = pageArguments(pageArgv);
} catch (error) {
  console.error((error as Error).message);
  process.exit(2);
}
const target = targetOf(environment);
const skipped = skippedAudits(target);
const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || null;
const expectedCommit = process.env.DEPLOY_SHA ?? "";
let base: string;
let headers: Record<string, string>;
if (target === "preview") {
  if (!secret) {
    console.error("VERCEL_AUTOMATION_BYPASS_SECRET is not set.");
    process.exit(2);
  }
  base = deploymentUrl;
  headers = { "x-vercel-protection-bypass": secret };
} else {
  // The bypass would skip the firewall and change what is measured.
  if (secret) {
    console.error(
      "VERCEL_AUTOMATION_BYPASS_SECRET is set; production is measured without it.",
    );
    process.exit(2);
  }
  if (!expectedCommit) {
    console.error("DEPLOY_SHA is not set.");
    process.exit(2);
  }
  // The deployment's own address is behind Vercel's sign-in.
  base = PRODUCTION_URL;
  headers = {};
}
// Lighthouse reads these settings through --cli-flags-path, whose parser turns
// numeric strings into numbers, and Chrome then refuses the header ("Invalid
// header value, string expected", run 43262721278).
if (
  Object.values(headers).some((value) => /^\s*-?[\d.]+(e\d+)?\s*$/i.test(value))
) {
  console.error(
    "A header value looks like a number, which Lighthouse would turn into one.",
  );
  process.exit(2);
}

// Nothing from an earlier run is kept or uploaded.
rmSync(REPORTS_DIR, { recursive: true, force: true });
rmSync(FIGURES_FILE, { force: true });

// One request, without following redirects. A mitigation stops everything at
// once, with no retry (AGENTS.md, section 2).
async function request(path: string): Promise<Response> {
  const response = await fetch(new URL(path, base), {
    headers,
    redirect: "manual",
  });
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
  return response;
}

// The first request: one per address, which checks the deployment answers before
// Chrome loads it, and gives the uncompressed HTML size (fetch decompresses
// the body). An address may be a lookup address, such as /fr/p/sp000001,
// which the site redirects permanently to the product's address (issue #73):
// the address measured is then the redirect's target, on the same origin,
// after one more request, so its words never need to be known here.
// An address may also be first-link:<page>:<prefix>, the first link on that
// page whose address starts with the prefix, such as a model page linked from
// a product page (issue #79): one more request reads the page first.
async function follow(requested: string) {
  let path = requested;
  let response = await request(path);
  if (response.status === 308) {
    const next = sameOriginPath(
      new URL(path, base),
      response.headers.get("location"),
    );
    await response.body?.cancel();
    if (!next) {
      console.error(
        `Stopped: ${path} redirects outside the deployment or to nowhere.`,
      );
      process.exit(1);
    }
    console.log(`${path} redirects to ${next}, which is measured.`);
    path = next;
    response = await request(path);
  }
  return { path, response };
}

async function firstLink(page: string, prefix: string): Promise<string> {
  const { path, response } = await follow(page);
  const html = await response.text();
  if (response.status !== 200) {
    console.error(`Stopped: ${path} answered ${response.status}.`);
    process.exit(1);
  }
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const href = new RegExp(`href="(${escaped}[^"]*)"`).exec(html)?.[1];
  if (!href) {
    console.error(`Stopped: ${path} has no link starting with ${prefix}.`);
    process.exit(1);
  }
  console.log(`${path} links first to ${href}, which is measured.`);
  return href;
}

const figures: Figures[] = [];
for (const { page, address } of pages) {
  const linked = /^first-link:([^:]+):(.+)$/.exec(address);
  const requested = linked
    ? await firstLink(linked[1] as string, linked[2] as string)
    : address;
  const { path, response } = await follow(requested);
  const html = await response.text();
  if (response.status !== 200) {
    console.error(`Stopped: ${path} answered ${response.status}.`);
    process.exit(1);
  }
  // Production: the public address must serve the deployed commit. No wait
  // and no retry: a mismatch fails the run (issue #67).
  if (target === "production") {
    const mismatch = commitMismatch(
      response.headers.get(COMMIT_HEADER),
      expectedCommit,
    );
    if (mismatch) {
      console.error(`::error title=Lighthouse::Stopped: ${path}: ${mismatch}`);
      process.exit(1);
    }
  }
  figures.push({
    page,
    path,
    htmlBytes: Buffer.byteLength(html),
    cache: response.headers.get("x-vercel-cache") ?? "",
    warmUp: null,
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
          url: figures.map(({ path }) => new URL(path, base).href),
          numberOfRuns: RUNS + 1,
          settings: {
            ...(Object.keys(headers).length > 0 && { extraHeaders: headers }),
            ...(skipped.length > 0 && { skipAudits: skipped }),
          },
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
    );
  const byPath = splitWarmUp(reports);
  for (const entry of figures) {
    const { path } = entry;
    const split = byPath.get(path);
    if (!split || split.runs.length !== RUNS)
      throw new Error(
        `${path}: ${split?.runs.length ?? 0} runs after the warm-up instead of ${RUNS}.`,
      );
    // The warm-up run passes the same checks as the measured runs, and its
    // report is saved too, but its scores are not counted.
    for (const [run, report] of [split.warmUp, ...split.runs].entries()) {
      if (report.runtimeError)
        throw new Error(`${path}: ${report.runtimeError.message}`);
      // Previews leave these audits out; production must run them.
      for (const audit of PREVIEW_SKIPPED_AUDITS)
        if (Boolean(report.audits[audit]) !== (target === "production"))
          throw new Error(
            target === "production"
              ? `${path}: the ${audit} audit did not run.`
              : `${path}: the ${audit} audit ran despite skipAudits.`,
          );
      const toolbar = toolbarRequests(report);
      if (toolbar.length > 0)
        throw new Error(
          `${path}: Vercel's toolbar loaded (${toolbar[0]}); it must be off for pre-production deployments in the project settings.`,
        );
      const scores = CATEGORIES.map(([id, name]) => {
        const score = report.categories[id]?.score;
        if (score === null || score === undefined)
          throw new Error(`${path}: no ${name} score.`);
        return [id, Math.round(score * 100)] as const;
      });
      if (run === 0) entry.warmUp = scores[0]?.[1] ?? null;
      else for (const [id, score] of scores) entry.scores[id].push(score);
      // Lighthouse 13 reports the element count in its DOM size insight.
      entry.elements =
        report.audits["dom-size-insight"]?.details?.debugData?.totalElements ??
        entry.elements;

      const name = `${path.replace(/^\/|\/$/g, "").replace(/\W+/g, "-") || "home"}-${run === 0 ? "warm-up" : `run-${run}`}`;
      const { json, html } = reportFiles(report, secret);
      writeFileSync(join(staging, `${name}.report.json`), json);
      writeFileSync(join(staging, `${name}.report.html`), html);
    }
  }
  mkdirSync(REPORTS_DIR, { recursive: true });
  for (const file of readdirSync(staging)) {
    copyFileSync(join(staging, file), join(REPORTS_DIR, file));
    console.log(`Saved ${file}, checked for the secret.`);
  }
} finally {
  rmSync(configDir, { recursive: true, force: true });
  rmSync(LHCI_DIR, { recursive: true, force: true });
  rmSync(staging, { recursive: true, force: true });
}

const summary = `### Lighthouse\n\n${scoresTable(figures, RUNS, target)}`;
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
writeFileSync(FIGURES_FILE, JSON.stringify({ target, runs: RUNS, figures }));

// The gate (ADR 0004), last, so the summary, the figures and the reports are
// written either way, and the workflow still publishes them.
if (belowThreshold(figures).length > 0) {
  console.error(`::error title=Lighthouse::${gateText(figures)}`);
  process.exit(1);
}
console.log(gateText(figures));
