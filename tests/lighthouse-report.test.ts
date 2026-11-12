// The Lighthouse check's helpers (issues #59 and #61): no report is saved
// with the bypass secret, the warm-up run is not counted, the 95 threshold
// fails a low median, and the texts carry the medians and the verdict.
import { describe, expect, it } from "vitest";
import {
  assertNoSecret,
  BYPASS_HEADER,
  belowThreshold,
  COMMENT_MARKER,
  checkTitle,
  commentBody,
  type Figures,
  gateText,
  MIN_PERFORMANCE,
  median,
  PREVIEW_SKIPPED_AUDITS,
  redact,
  reportFiles,
  splitWarmUp,
  toolbarRequests,
} from "../scripts/lighthouse-report.ts";

const SECRET = "test-secret-0123456789abcdef";

// The parts of a Lighthouse result that matter here: Lighthouse copies the
// extra headers it sent into configSettings.
const lhr = () => ({
  lighthouseVersion: "13.6.0",
  requestedUrl: "https://preview.example/product/1",
  configSettings: {
    formFactor: "mobile",
    extraHeaders: { [BYPASS_HEADER]: SECRET },
  },
  categories: { performance: { score: 0.98 } },
});

const figures: Figures[] = [
  {
    path: "/product/1",
    htmlBytes: 228_456,
    cache: "HIT",
    warmUp: 92,
    scores: {
      performance: [81, 98, 98, 99, 98],
      accessibility: [100, 100, 100, 100, 100],
      "best-practices": [96, 96, 96, 96, 96],
      seo: [100, 100, 100, 100, 100],
    },
    elements: 2053,
  },
];

describe("median", () => {
  it("takes the middle of an odd count, unsorted", () => {
    expect(median([81, 98, 98, 99, 98])).toBe(98);
    expect(median([3, 1, 2])).toBe(2);
  });
  it("averages the two middles of an even count", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it("refuses no values", () => {
    expect(() => median([])).toThrow();
  });
});

describe("splitWarmUp", () => {
  const run = (path: string, minute: number) => ({
    requestedUrl: `https://preview.example${path}`,
    fetchTime: `2026-11-12T17:${String(minute).padStart(2, "0")}:00.000Z`,
  });
  it("takes each address's earliest run as its warm-up, whatever the order", () => {
    const split = splitWarmUp([
      run("/product/1", 3),
      run("/", 7),
      run("/product/1", 1),
      run("/", 6),
      run("/product/1", 2),
    ]);
    expect(split.get("/product/1")?.warmUp.fetchTime).toContain("17:01");
    expect(split.get("/product/1")?.runs.map((r) => r.fetchTime)).toEqual([
      "2026-11-12T17:02:00.000Z",
      "2026-11-12T17:03:00.000Z",
    ]);
    expect(split.get("/")?.warmUp.fetchTime).toContain("17:06");
    expect(split.get("/")?.runs).toHaveLength(1);
  });
  it("leaves a single run as the warm-up, with no measured run", () => {
    expect(splitWarmUp([run("/", 1)]).get("/")?.runs).toEqual([]);
    expect(splitWarmUp([]).size).toBe(0);
  });
});

describe("the 95 threshold", () => {
  const withRuns = (path: string, performance: number[]): Figures => ({
    ...(figures[0] as Figures),
    path,
    scores: { ...(figures[0] as Figures).scores, performance },
  });
  it("is 95, as ADR 0004 decides", () => {
    expect(MIN_PERFORMANCE).toBe(95);
  });
  it("passes a median of exactly 95, ignoring one low run", () => {
    const f = [withRuns("/product/1", [60, 95, 95, 99, 100])];
    expect(belowThreshold(f)).toEqual([]);
    expect(gateText(f)).toMatch(/^Passed/);
  });
  it("fails a median below 95 and names each failing address", () => {
    const f = [
      withRuns("/product/1", [94, 94, 100, 94, 100]),
      withRuns("/", [100, 100, 100, 100, 100]),
      withRuns("/model/1", [90, 91, 92, 93, 99]),
    ];
    expect(belowThreshold(f)).toEqual([
      { path: "/product/1", median: 94 },
      { path: "/model/1", median: 92 },
    ]);
    expect(gateText(f)).toBe(
      "Failed: `/product/1` has a median performance of 94; `/model/1` has a median performance of 92, below 95.",
    );
  });
  it("takes another threshold, as the regression check of #61 does", () => {
    expect(belowThreshold(figures, 101)).toEqual([
      { path: "/product/1", median: 98 },
    ]);
  });
});

describe("redact", () => {
  it("removes the extra headers and keeps the other settings", () => {
    const original = lhr();
    const clean = redact(original);
    expect(clean.configSettings).toEqual({ formFactor: "mobile" });
    expect(JSON.stringify(clean)).not.toContain(SECRET);
    // The original is left as it was.
    expect(original.configSettings.extraHeaders).toBeDefined();
  });
});

describe("assertNoSecret", () => {
  it("refuses a text holding the secret", () => {
    expect(() => assertNoSecret(`a ${SECRET} b`, SECRET, "X")).toThrow(
      /secret/,
    );
  });
  it("refuses a text holding the header's name, in any case", () => {
    expect(() =>
      assertNoSecret("X-Vercel-Protection-Bypass: …", SECRET, "X"),
    ).toThrow(/header/);
  });
  it("refuses to check without a secret", () => {
    expect(() => assertNoSecret("text", "", "X")).toThrow();
  });
  it("accepts a clean text", () => {
    expect(() => assertNoSecret("clean", SECRET, "X")).not.toThrow();
  });
});

describe("reportFiles", () => {
  it("writes JSON and HTML reports without the secret or the header", () => {
    const { json, html } = reportFiles(lhr(), SECRET);
    for (const text of [json, html]) {
      expect(text).not.toContain(SECRET);
      expect(text.toLowerCase()).not.toContain(BYPASS_HEADER);
    }
    expect(JSON.parse(json).configSettings.formFactor).toBe("mobile");
    // The HTML report embeds the redacted result.
    expect(html).toContain("<!doctype html>");
    expect(html).toContain('"formFactor":"mobile"');
  });
});

describe("toolbarRequests", () => {
  const withRequests = (urls: string[]) => ({
    audits: {
      "network-requests": { details: { items: urls.map((url) => ({ url })) } },
    },
  });
  it("finds the toolbar's requests to vercel.live", () => {
    expect(
      toolbarRequests(
        withRequests([
          "https://preview.example/product/1",
          "https://vercel.live/_next-live/feedback/feedback.js",
        ]),
      ),
    ).toEqual(["https://vercel.live/_next-live/feedback/feedback.js"]);
  });
  it("finds none on a page without the toolbar, or without the audit", () => {
    expect(
      toolbarRequests(withRequests(["https://preview.example/product/1"])),
    ).toEqual([]);
    expect(toolbarRequests({ audits: {} })).toEqual([]);
  });
});

describe("texts", () => {
  it("puts the four medians in the check's title", () => {
    expect(checkTitle(figures)).toBe(
      "Performance 98, accessibility 100, best practices 96, SEO 100",
    );
  });
  it("prefixes each address when there are several", () => {
    const two = [
      figures[0] as Figures,
      { ...(figures[0] as Figures), path: "/" },
    ];
    expect(checkTitle(two)).toMatch(/^\/product\/1: Performance 98.*; \/: /);
  });
  it("starts the comment with its marker and gives the runs and reports", () => {
    const body = commentBody(
      figures,
      5,
      "c52f0a476e3633dfb74cf5077b70b2674def698a",
      "https://github.com/o/r/actions/runs/1",
      "https://github.com/o/r/actions/runs/1/artifacts/2",
    );
    expect(body.startsWith(COMMENT_MARKER)).toBe(true);
    expect(body).toContain("`c52f0a4`");
    expect(body).toContain(
      "| `/product/1` | 98 | 100 | 96 | 100 | 81, 98, 98, 99, 98 | 92 | 228456 | 2053 |",
    );
    expect(body).toContain("after one warm-up run that is not counted");
    expect(body).toContain(
      "**Passed: every address has a median performance of at least 95.**",
    );
    expect(body).toContain("/artifacts/2");
  });
  it("names the SEO audits left out on previews", () => {
    const body = commentBody(figures, 5, "abc", "u", null);
    for (const audit of PREVIEW_SKIPPED_AUDITS)
      expect(body).toContain(`\`${audit}\``);
  });
  it("says when the reports could not be uploaded", () => {
    expect(commentBody(figures, 5, "abc", "u", null)).toContain(
      "could not be uploaded",
    );
  });
});
