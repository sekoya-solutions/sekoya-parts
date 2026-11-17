// The menu by appliance (issue #198): every appliance type in exactly one
// group, every category under at least one type, and the dictionaries naming
// each group.
import { describe, expect, it } from "vitest";
import { applianceTypes, categories, slugify } from "../catalog/generator.ts";
import { locales } from "../cms/locales.ts";
import {
  MENU_GROUPS,
  menuGroupKey,
  TYPE_CATEGORIES,
  typeCategories,
} from "../site/appliance-menu.ts";
import { dictionaries } from "../site/dictionary.ts";

const namings = categories().map((category) => ({
  id: category.id,
  names: category.names,
  slugs: Object.fromEntries(
    Object.entries(category.names).map(([locale, name]) => [
      locale,
      slugify(name),
    ]),
  ) as typeof category.names,
}));

describe("the menu by appliance", () => {
  it("puts every appliance type in exactly one group", () => {
    const grouped = MENU_GROUPS.flatMap(({ types }) => types);
    expect([...grouped].sort()).toEqual([...applianceTypes].sort());
  });

  it("lists every category under at least one type, with known ids only", () => {
    const ids = new Set(categories().map((category) => category.id));
    const listed = new Set(Object.values(TYPE_CATEGORIES).flat());
    expect([...listed].sort((a, b) => a - b)).toEqual(
      [...ids].sort((a, b) => a - b),
    );
    for (const list of Object.values(TYPE_CATEGORIES))
      expect(new Set(list).size).toBe(list.length);
  });

  it("sorts a type's categories by name and skips a missing one", () => {
    const oven = typeCategories("oven", namings, "fr").map(
      (category) => category.names.fr,
    );
    expect(oven).toEqual([...oven].sort((a, b) => a.localeCompare(b, "fr")));
    expect(oven).toHaveLength(TYPE_CATEGORIES.oven.length);
    const withoutLamp = namings.filter((category) => category.id !== 11);
    expect(
      typeCategories("oven", withoutLamp, "fr").map((c) => c.id),
    ).not.toContain(11);
  });

  it.each(locales)("names each group in %s", (locale) => {
    for (const { group } of MENU_GROUPS)
      expect(dictionaries[locale][menuGroupKey(group)].trim()).not.toBe("");
  });
});
