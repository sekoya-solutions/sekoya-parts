// The catalog's tables, which scripts/generate.ts locks, empties and loads,
// children first so TRUNCATE and the checks read well. Payload's users,
// sessions and preferences are not listed, nor the translation memory and
// lease (issue #104), so a catalog reload keeps translations already paid for.
export const catalogTables = [
  "compatibility",
  "appliance_models",
  "products_locales",
  "products",
  "brands",
  "categories_locales",
  "categories",
] as const;
