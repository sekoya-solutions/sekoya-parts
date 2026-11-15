// The home page's promotions (issue #155): their kinds, links and when they
// show. Pure, with no Payload or Next.js import, so the unit tests read it.
import { categories, slugify } from "../catalog/generator.ts";
import type { Locale } from "../cms/locales.ts";
import {
  brandIndexPath,
  type CategoryNaming,
  categoryPath,
  finderPath,
} from "./addresses.ts";

export const PROMOTION_KINDS = ["slide", "tile"] as const;
export type PromotionKind = (typeof PROMOTION_KINDS)[number];

/** Where a promotion leads: a category, the brand index or the part finder. */
export const PROMOTION_LINKS = ["category", "brands", "finder"] as const;

/**
 * The categories a promotion can link to: the generator's, by English slug,
 * which a catalog reload keeps (catalog/generator.ts).
 */
export const PROMOTION_CATEGORIES: readonly string[] = categories().map(
  (category) => slugify(category.names.en),
);
export type PromotionLink = (typeof PROMOTION_LINKS)[number];

/** A promotion's dates, each optional: no start is always started. */
export type PromotionDates = {
  startsAt?: string | null;
  endsAt?: string | null;
};

/** Whether a promotion shows at a moment: started, and not yet ended. */
export const isRunning = (dates: PromotionDates, now: number): boolean =>
  (!dates.startsAt || Date.parse(dates.startsAt) <= now) &&
  (!dates.endsAt || now < Date.parse(dates.endsAt));

/** The next moment a promotion starts or ends, after now, or null. */
export function nextPromotionChange(
  promotions: Iterable<PromotionDates>,
  now: number,
): number | null {
  let next: number | null = null;
  for (const { startsAt, endsAt } of promotions)
    for (const date of [startsAt, endsAt]) {
      if (!date) continue;
      const time = Date.parse(date);
      if (time > now && (next === null || time < next)) next = time;
    }
  return next;
}

/**
 * Where a promotion leads in a language. A category the catalog no longer
 * has, by its English slug, leads to the part finder instead.
 */
export function promotionPath(
  locale: Locale,
  promotion: { linkTo: PromotionLink; category?: string | null },
  categories: readonly CategoryNaming[],
): string {
  if (promotion.linkTo === "brands") return brandIndexPath(locale);
  if (promotion.linkTo === "category") {
    const category = categories.find((c) => c.slugs.en === promotion.category);
    if (category) return categoryPath(locale, category.slugs[locale]);
  }
  return finderPath(locale);
}
