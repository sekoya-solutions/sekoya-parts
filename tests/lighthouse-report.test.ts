// The Lighthouse check's helpers (issue #59): no report is saved with the
// bypass secret, and the texts carry the medians.
import { describe, expect, it } from "vitest";
import {
  assertNoSecret,
  BYPASS_HEADER,
  COMMENT_MARKER,
  checkTitle,
  commentBody,
  type Figures,
  median,
  redact,
  reportFiles,
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
      "| `/product/1` | 98 | 100 | 96 | 100 | 81, 98, 98, 99, 98 | 228456 | 2053 |",
    );
    expect(body).toContain("/artifacts/2");
  });
  it("says when the reports could not be uploaded", () => {
    expect(commentBody(figures, 5, "abc", "u", null)).toContain(
      "could not be uploaded",
    );
  });
});
