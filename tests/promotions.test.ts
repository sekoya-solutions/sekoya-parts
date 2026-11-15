// The home page's promotions: when they show, when their part expires and
// where they lead (issue #155).
import { describe, expect, it } from "vitest";
import { categories, slugify } from "../catalog/generator.ts";
import { type CategoryNaming, perLocale } from "../site/addresses.ts";
import {
  isRunning,
  nextPromotionChange,
  PROMOTION_CATEGORIES,
  promotionPath,
} from "../site/promotion-rules.ts";

const NOW = Date.parse("2026-11-16T00:30:00Z");

describe("isRunning", () => {
  it("shows a promotion with no dates, or between its start and its end", () => {
    expect(isRunning({}, NOW)).toBe(true);
    expect(isRunning({ startsAt: "2026-11-16T00:00:00Z" }, NOW)).toBe(true);
    expect(isRunning({ startsAt: "2026-11-16T01:00:00Z" }, NOW)).toBe(false);
    expect(isRunning({ endsAt: "2026-11-16T00:30:00Z" }, NOW)).toBe(false);
    expect(isRunning({ endsAt: "2026-11-17T00:00:00Z" }, NOW)).toBe(true);
  });
});

describe("nextPromotionChange", () => {
  it("is the next start or end after now, among shown and coming promotions", () => {
    expect(
      nextPromotionChange(
        [
          { endsAt: "2026-11-20T00:00:00Z" },
          { startsAt: "2026-11-16T06:00:00Z" },
          { startsAt: "2026-11-01T00:00:00Z" },
        ],
        NOW,
      ),
    ).toBe(Date.parse("2026-11-16T06:00:00Z"));
    expect(nextPromotionChange([{}], NOW)).toBeNull();
  });
});

describe("promotionPath", () => {
  const naming: CategoryNaming[] = categories().map((category) => ({
    id: category.id,
    names: category.names,
    slugs: perLocale((locale) => slugify(category.names[locale])),
  }));

  it("leads to the category by its English slug, in the page's language", () => {
    const knob = naming.find((c) => c.slugs.en === "knob");
    expect(
      promotionPath("de", { linkTo: "category", category: "knob" }, naming),
    ).toBe(`/de/${knob?.slugs.de}`);
  });

  it("leads to the part finder when the catalog has no such category", () => {
    expect(
      promotionPath("fr", { linkTo: "category", category: "toaster" }, naming),
    ).toBe("/fr/trouver-une-piece");
  });

  it("leads to the brand index or the finder", () => {
    expect(promotionPath("en", { linkTo: "brands" }, naming)).toBe(
      "/en/brands",
    );
    expect(promotionPath("en", { linkTo: "finder" }, naming)).toBe(
      "/en/find-a-part",
    );
  });

  it("offers every generated category, and only those", () => {
    expect(PROMOTION_CATEGORIES).toHaveLength(12);
    expect(PROMOTION_CATEGORIES).toContain("heating-element");
  });
});
