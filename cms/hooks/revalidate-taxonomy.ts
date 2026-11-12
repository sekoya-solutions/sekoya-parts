// Refreshes every cached read that shows a category or a brand: product
// headings and address lookups, since an ordinary product's name and address
// are built from them (docs/adr/0007-catalog-data-model.md,
// docs/adr/0011-languages-and-seo.md). The same transaction notes as
// revalidate-product.ts apply.
import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
} from "payload";
import { brandTag, categoryTag } from "../../site/tags.ts";
import { refresh } from "./refresh.ts";

export const revalidateCategoryAfterChange: CollectionAfterChangeHook = ({
  doc,
}) => {
  refresh([categoryTag(doc.id)]);
  return doc;
};

export const revalidateCategoryAfterDelete: CollectionAfterDeleteHook = ({
  id,
}) => {
  refresh([categoryTag(Number(id))]);
};

export const revalidateBrandAfterChange: CollectionAfterChangeHook = ({
  doc,
}) => {
  refresh([brandTag(doc.id)]);
  return doc;
};

export const revalidateBrandAfterDelete: CollectionAfterDeleteHook = ({
  id,
}) => {
  refresh([brandTag(Number(id))]);
};
