// The Lighthouse check's helpers (issues #59, #61, #67, #73 and #83): no report is
// saved with the bypass secret, the warm-up run is not counted, a median below
// 95 in performance or accessibility fails, and the texts carry the medians
// and the verdict, one check per page with coloured symbols (issue #96).
import { describe, expect, it } from "vitest";
import {
  assertNoSecret,
  BLOCKED_LABEL,
  BYPASS_HEADER,
  belowThreshold,
  bypassHeaders,
  COMMENT_MARKER,
  CRAWLABLE_AUDIT,
  categoryScore,
  checkName,
  checkTitle,
  commentBody,
  commitMismatch,
  crawlableMismatch,
  type Figures,
  gateText,
  MIN_SCORES,
  median,
  PREVIEW_SKIPPED_AUDITS,
  PRODUCTION_URL,
  pageArgument,
  pageArguments,
  redact,
  reportFiles,
  type ScoredReport,
  SYMBOLS_LEGEND,
  sameOriginPath,
  scoreSymbol,
  scoresTable,
  skippedAudits,
  splitWarmUp,
  targetOf,
  toolbarRequests,
} from "../scripts/lighthouse-report.ts";
import { COMMIT_HEADER, commitHeaders } from "../site/commit.ts";

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
    page: "product",
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

describe("the minimum scores", () => {
  const withRuns = (
    page: string,
    path: string,
    performance: number[],
    accessibility = [100, 100, 100, 100, 100],
  ): Figures => ({
    ...(figures[0] as Figures),
    page,
    path,
    scores: { ...(figures[0] as Figures).scores, performance, accessibility },
  });
  it("are 95 in performance (ADR 0004) and accessibility (ADR 0012)", () => {
    expect(MIN_SCORES).toEqual({ performance: 95, accessibility: 95 });
  });
  it("pass a median of exactly 95, ignoring one low run", () => {
    const one = withRuns(
      "product",
      "/product/1",
      [60, 95, 95, 99, 100],
      [60, 95, 95, 99, 100],
    );
    expect(belowThreshold([one])).toEqual([]);
    expect(gateText([one])).toBe(
      "Passed: a median performance of at least 95 and accessibility of at least 95.",
    );
    expect(gateText([one, { ...one, page: "home", path: "/" }])).toBe(
      "Passed: every page has a median performance of at least 95 and accessibility of at least 95.",
    );
  });
  it("fail a median below 95 and name each failing page", () => {
    const f = [
      withRuns("product", "/product/1", [94, 94, 100, 94, 100]),
      withRuns("home", "/", [100, 100, 100, 100, 100]),
      withRuns("model", "/model/1", [90, 91, 92, 93, 99]),
    ];
    expect(belowThreshold(f)).toEqual([
      {
        page: "product",
        path: "/product/1",
        category: "performance",
        median: 94,
        min: 95,
      },
      {
        page: "model",
        path: "/model/1",
        category: "performance",
        median: 92,
        min: 95,
      },
    ]);
    expect(gateText(f)).toBe(
      "Failed: product (`/product/1`) has a median performance of 94, below 95; model (`/model/1`) has a median performance of 92, below 95.",
    );
    // Each page's own check passes or fails with that page alone.
    expect(f.map((one) => belowThreshold([one]).length > 0)).toEqual([
      true,
      false,
      true,
    ]);
  });
  it("fail an accessibility median below 95 even when performance passes", () => {
    const f = [withRuns("home", "/fr", [100, 100, 100], [94, 94, 100])];
    expect(belowThreshold(f)).toEqual([
      {
        page: "home",
        path: "/fr",
        category: "accessibility",
        median: 94,
        min: 95,
      },
    ]);
    expect(gateText(f)).toBe(
      "Failed: home (`/fr`) has a median accessibility of 94, below 95.",
    );
  });
  it("take other minimums, as the regression check of #61 does", () => {
    expect(belowThreshold(figures, { performance: 101 })).toEqual([
      {
        page: "product",
        path: "/product/1",
        category: "performance",
        median: 98,
        min: 101,
      },
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

describe("pages", () => {
  it("reads <page>=<address>, the address keeping its own colons", () => {
    expect(pageArgument("home=/fr")).toEqual({ page: "home", address: "/fr" });
    expect(
      pageArgument("model=first-link:/fr/p/sp000001:/fr/appareil/"),
    ).toEqual({
      page: "model",
      address: "first-link:/fr/p/sp000001:/fr/appareil/",
    });
  });
  it("refuses an address without a page, or a page named twice", () => {
    expect(() => pageArgument("/fr")).toThrow(/<page>=<address>/);
    expect(() => pageArgument("Home=/fr")).toThrow(/<page>=<address>/);
    expect(() => pageArguments(["home=/fr", "home=/en"])).toThrow(/twice/);
  });
  it("names one check per page", () => {
    expect(checkName(figures[0] as Figures)).toBe(
      "Lighthouse scores · product",
    );
  });
});

describe("symbols", () => {
  it("are green from 95, yellow from 90 and red below", () => {
    expect([100, 95, 94.5, 90, 89.5, 0].map(scoreSymbol)).toEqual([
      "🟢",
      "🟢",
      "🟡",
      "🟡",
      "🔴",
      "🔴",
    ]);
  });
});

describe("texts", () => {
  it("puts the four medians and their symbols in the page check's title", () => {
    expect(checkTitle(figures[0] as Figures)).toBe(
      "🟢 Performance 98 · 🟢 Accessibility 100 · 🟢 Best practices 96 · 🟢 SEO 100",
    );
    const lower: Figures = {
      ...(figures[0] as Figures),
      scores: {
        performance: [92, 92, 92],
        accessibility: [80, 80, 80],
        "best-practices": [96, 96, 96],
        seo: [100, 100, 100],
      },
    };
    expect(checkTitle(lower)).toBe(
      "🟡 Performance 92 · 🔴 Accessibility 80 · 🟢 Best practices 96 · 🟢 SEO 100",
    );
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
      "| product `/product/1` | 🟢 98 | 🟢 100 | 🟢 96 | 🟢 100 | 81, 98, 98, 99, 98 | 92 | 228456 | 2053 |",
    );
    expect(body).toContain("after one warm-up run that is not counted");
    expect(body).toContain(SYMBOLS_LEGEND);
    expect(body).toContain(
      "**Passed: a median performance of at least 95 and accessibility of at least 95.**",
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
  it("links the measured commit's own preview (issue #123)", () => {
    expect(
      commentBody(
        figures,
        5,
        "c52f0a476e3633dfb74cf5077b70b2674def698a",
        "u",
        null,
        "https://sekoya-parts-abc.vercel.app",
      ),
    ).toContain("[Preview](https://sekoya-parts-abc.vercel.app) of `c52f0a4`");
    expect(commentBody(figures, 5, "abc", "u", null)).toContain(
      "Preview of `abc`",
    );
  });
});

// Production (issue #67): the public address, without the secret, with every
// SEO audit, and only once it serves the deployed commit.
describe("production target", () => {
  const sha = "c52f0a476e3633dfb74cf5077b70b2674def698a";
  it("maps Vercel's environment names, and refuses others", () => {
    expect(targetOf("Production")).toBe("production");
    expect(targetOf("Preview")).toBe("preview");
    expect(targetOf("Preview – sekoya-parts")).toBe("preview");
    expect(() => targetOf("Staging")).toThrow(/Unknown/);
  });
  it("skips the SEO audits on previews only", () => {
    expect(skippedAudits("preview")).toEqual(PREVIEW_SKIPPED_AUDITS);
    expect(skippedAudits("production")).toEqual([]);
  });
  it("sends the bypass secret on both targets, and needs it (issue #135)", () => {
    expect(bypassHeaders("s3cret-value")).toEqual({
      [BYPASS_HEADER]: "s3cret-value",
    });
    expect(() => bypassHeaders(null)).toThrow(/not set/);
    expect(() => bypassHeaders("")).toThrow(/not set/);
    expect(scoresTable(figures, 5, "production")).not.toContain(
      "without the bypass header",
    );
  });
  it("measures the public address, not a deployment's own", () => {
    expect(PRODUCTION_URL).toBe("https://sekoya-parts.vercel.app");
  });
  it("accepts the deployed commit only", () => {
    expect(commitMismatch(sha, sha)).toBeNull();
    expect(
      commitMismatch("1e5854296e9f1b829a4105766dac8845c3578870", sha),
    ).toMatch(/serves 1e58542, not c52f0a4/);
    expect(commitMismatch(null, sha)).toMatch(/no commit header/);
    expect(commitMismatch("", sha)).toMatch(/no commit header/);
  });
  it("checks a report for the header's name when there is no secret", () => {
    expect(() => assertNoSecret("clean", null, "X")).not.toThrow();
    expect(() =>
      assertNoSecret("x-vercel-protection-bypass", null, "X"),
    ).toThrow(/header/);
    // A production result: Lighthouse sent no extra headers.
    const production = {
      ...lhr(),
      configSettings: { formFactor: "mobile", extraHeaders: undefined },
    };
    const { json } = reportFiles(production, null);
    expect(JSON.parse(json).configSettings.formFactor).toBe("mobile");
  });
  it("describes the production run instead of the preview's skipped audits", () => {
    const table = scoresTable(figures, 5, "production");
    expect(table).toContain(PRODUCTION_URL);
    expect(table).toContain("every SEO audit");
    expect(table).toContain("against the site's own robots.txt");
    const preview = scoresTable(figures, 5, "preview");
    expect(preview).toContain("leaves out `is-crawlable`");
    expect(preview).not.toContain("against the site's own robots.txt");
  });
});

describe("commitHeaders", () => {
  it("sends the commit on every path when the build has one", () => {
    expect(commitHeaders("abc123")).toEqual([
      {
        source: "/:path*",
        headers: [{ key: COMMIT_HEADER, value: "abc123" }],
      },
    ]);
    expect(COMMIT_HEADER).toBe("x-sekoya-commit");
  });
  it("adds no rule when the build has no commit", () => {
    expect(commitHeaders(undefined)).toEqual([]);
    expect(commitHeaders("")).toEqual([]);
  });
});

describe("sameOriginPath", () => {
  const requested = new URL("https://preview.example/fr/p/sp000001");

  it("follows a redirect on the same origin, absolute or relative", () => {
    expect(
      sameOriginPath(
        requested,
        "https://preview.example/fr/courroie/courroie-x-sp000001",
      ),
    ).toBe("/fr/courroie/courroie-x-sp000001");
    expect(sameOriginPath(requested, "/fr/courroie/courroie-x-sp000001")).toBe(
      "/fr/courroie/courroie-x-sp000001",
    );
  });

  it("accepts a repeated Location header only when every value is the same", () => {
    expect(
      sameOriginPath(
        requested,
        "/fr/courroie/courroie-x-sp000001, /fr/courroie/courroie-x-sp000001",
      ),
    ).toBe("/fr/courroie/courroie-x-sp000001");
    expect(
      sameOriginPath(
        requested,
        "/fr/courroie/a-sp000001, /fr/joint/b-sp000001",
      ),
    ).toBeNull();
  });

  it("refuses another origin, the same address or no address", () => {
    expect(
      sameOriginPath(requested, "https://elsewhere.example/fr"),
    ).toBeNull();
    expect(sameOriginPath(requested, "http://preview.example/fr")).toBeNull();
    expect(sameOriginPath(requested, "/fr/p/sp000001")).toBeNull();
    expect(sameOriginPath(requested, null)).toBeNull();
    expect(sameOriginPath(requested, "")).toBeNull();
  });
});

// Production's run on 1872ae7 (issue #130): the reference page, which
// robots.txt disallows on purpose (issue #121), scored SEO 66, with these
// audits, weights and scores.
const ROBOTS_URL = `${PRODUCTION_URL}/robots.txt`;
const blockedReport = (
  crawlable: { score: number | null; items?: unknown[] } = {
    score: 0,
    items: [
      { source: { type: "source-location", url: ROBOTS_URL, line: 1035 } },
    ],
  },
): ScoredReport => {
  const refs: [string, number, number | null, string][] = [
    ["is-crawlable", 4.043478260869565, crawlable.score, "binary"],
    ["document-title", 1, 1, "binary"],
    ["meta-description", 1, 1, "binary"],
    ["http-status-code", 1, 1, "binary"],
    ["link-text", 1, 1, "binary"],
    ["crawlable-anchors", 1, 1, "binary"],
    ["robots-txt", 1, 1, "binary"],
    ["image-alt", 0, null, "notApplicable"],
    ["hreflang", 1, 1, "binary"],
    ["canonical", 1, 1, "binary"],
    ["structured-data", 0, null, "manual"],
  ];
  return {
    categories: {
      seo: {
        score: crawlable.score === 0 ? 0.66 : 1,
        auditRefs: refs.map(([id, weight]) => ({ id, weight })),
      },
    },
    audits: Object.fromEntries(
      refs.map(([id, , score, scoreDisplayMode]) => [
        id,
        {
          score,
          scoreDisplayMode,
          ...(id === CRAWLABLE_AUDIT && {
            details: { items: crawlable.items ?? [] },
          }),
        },
      ]),
    ),
  };
};

describe("is-crawlable against robots.txt on production", () => {
  it("computes Lighthouse's own SEO score, then the score without is-crawlable", () => {
    const report = blockedReport();
    expect(Math.round(categoryScore(report, "seo") * 100)).toBe(66);
    expect(categoryScore(report, "seo", [CRAWLABLE_AUDIT])).toBe(1);
    expect(categoryScore(blockedReport({ score: 1 }), "seo")).toBe(1);
  });

  it("accepts a disallowed page blocked by robots.txt and an allowed page that passes", () => {
    expect(crawlableMismatch(blockedReport(), false, ROBOTS_URL)).toBeNull();
    expect(
      crawlableMismatch(blockedReport({ score: 1 }), true, ROBOTS_URL),
    ).toBeNull();
  });

  it("refuses every result that contradicts robots.txt", () => {
    expect(crawlableMismatch(blockedReport(), true, ROBOTS_URL)).toMatch(
      /allows it, but is-crawlable failed/,
    );
    expect(
      crawlableMismatch(blockedReport({ score: 1 }), false, ROBOTS_URL),
    ).toMatch(/disallows it, but is-crawlable passed/);
    // Blocked by a noindex tag, or by robots.txt and a noindex tag.
    const noindex = {
      source: { type: "node", snippet: '<meta name="robots">' },
    };
    for (const items of [
      [noindex],
      [{ source: { type: "source-location", url: ROBOTS_URL } }, noindex],
      [],
    ])
      expect(
        crawlableMismatch(
          blockedReport({ score: 0, items }),
          false,
          ROBOTS_URL,
        ),
      ).toMatch(/another reason than robots.txt/);
    const missing = blockedReport();
    delete missing.audits[CRAWLABLE_AUDIT];
    expect(crawlableMismatch(missing, true, ROBOTS_URL)).toMatch(/did not run/);
  });

  it("marks a disallowed page in its check and in the table", () => {
    const blocked = { ...(figures[0] as Figures), blockedByRobots: true };
    expect(checkTitle(blocked)).toContain(BLOCKED_LABEL);
    expect(scoresTable([blocked], 5, "production")).toContain(
      ` (${BLOCKED_LABEL})`,
    );
    expect(checkTitle(figures[0] as Figures)).not.toContain(BLOCKED_LABEL);
  });
});
