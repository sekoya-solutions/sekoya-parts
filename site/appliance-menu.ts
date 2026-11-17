// The header's menu by appliance (issue #198): the catalog's eight appliance
// types in three groups, each type with the part categories that make sense
// for it. The catalog itself does not link a type to its categories, since a
// product fits models of every type (docs/adr/0007-catalog-data-model.md), so
// this map is the site's own, for the demo. Categories are named by their id,
// the same at every scale and seed (catalog/generator.ts); a category may sit
// under several types.
import type { ApplianceType } from "../catalog/generator.ts";
import type { Locale } from "../cms/locales.ts";
import type { CategoryNaming } from "./addresses.ts";

/** A group of the menu, by the key of its name in the dictionaries. */
export type MenuGroup = "washing" | "cooking" | "cooling";

/** The groups in menu order, each with its appliance types in order. */
export const MENU_GROUPS: readonly {
  group: MenuGroup;
  types: readonly ApplianceType[];
}[] = [
  { group: "washing", types: ["washing-machine", "dryer", "dishwasher"] },
  {
    group: "cooking",
    types: ["oven", "cooktop", "range-hood", "microwave"],
  },
  { group: "cooling", types: ["refrigerator"] },
];

// The category ids, as the generator numbers them.
const BELT = 1;
const DOOR_SEAL = 2;
const DRAIN_PUMP = 3;
const HEATING_ELEMENT = 4;
const FILTER = 5;
const THERMOSTAT = 6;
const MOTOR = 7;
const CONTROL_BOARD = 8;
const HINGE = 9;
const KNOB = 10;
const LAMP = 11;
const BASKET = 12;

/** Each appliance type's categories, by id. */
export const TYPE_CATEGORIES: Readonly<
  Record<ApplianceType, readonly number[]>
> = {
  "washing-machine": [
    BELT,
    DOOR_SEAL,
    DRAIN_PUMP,
    HEATING_ELEMENT,
    FILTER,
    MOTOR,
    CONTROL_BOARD,
    KNOB,
  ],
  dryer: [
    BELT,
    HEATING_ELEMENT,
    FILTER,
    THERMOSTAT,
    MOTOR,
    CONTROL_BOARD,
    KNOB,
  ],
  dishwasher: [
    DOOR_SEAL,
    DRAIN_PUMP,
    HEATING_ELEMENT,
    FILTER,
    CONTROL_BOARD,
    HINGE,
    BASKET,
  ],
  oven: [
    DOOR_SEAL,
    HEATING_ELEMENT,
    THERMOSTAT,
    CONTROL_BOARD,
    HINGE,
    KNOB,
    LAMP,
  ],
  cooktop: [HEATING_ELEMENT, THERMOSTAT, CONTROL_BOARD, KNOB],
  "range-hood": [FILTER, MOTOR, CONTROL_BOARD, LAMP],
  microwave: [MOTOR, CONTROL_BOARD, HINGE, LAMP],
  refrigerator: [
    DOOR_SEAL,
    FILTER,
    THERMOSTAT,
    CONTROL_BOARD,
    HINGE,
    LAMP,
    BASKET,
  ],
};

/** The dictionary key of a group's name. */
export const menuGroupKey = (group: MenuGroup) => `menuGroup:${group}` as const;

/**
 * An appliance type's categories as the catalog names them, sorted by name in
 * one language. An id the catalog no longer has is skipped.
 */
export function typeCategories(
  type: ApplianceType,
  categories: readonly CategoryNaming[],
  locale: Locale,
): CategoryNaming[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  return TYPE_CATEGORIES[type]
    .flatMap((id) => {
      const category = byId.get(id);
      return category ? [category] : [];
    })
    .sort((a, b) => a.names[locale].localeCompare(b.names[locale], locale));
}
