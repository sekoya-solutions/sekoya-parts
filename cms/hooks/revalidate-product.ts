// Refreshes only the product page parts a save changed
// (docs/adr/0008-caching-and-partial-refresh.md), and the address lookup of
// the references concerned (docs/adr/0011-languages-and-seo.md).
//
// The hooks run inside Payload's transaction, before the commit. That is safe:
// revalidateTag only records the tags, and Next.js sends them to the cache
// handlers once the request ends, after the commit, so a visitor cannot cache
// the old value between the two.
//
// Outside a Next.js request (a script using Payload's Local API), revalidateTag
// throws, so the save fails and its transaction rolls back rather than
// leaving a page part stale with no expiry.
import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
} from "payload";
import { tagsForProductChange, tagsForProductDelete } from "../../site/tags.ts";
import { refresh } from "./refresh.ts";

export const revalidateProductAfterChange: CollectionAfterChangeHook = ({
  doc,
  previousDoc,
  operation,
}) => {
  refresh(
    tagsForProductChange(
      doc.id,
      doc,
      operation === "create" ? undefined : previousDoc,
    ),
  );
  return doc;
};

export const revalidateProductAfterDelete: CollectionAfterDeleteHook = ({
  id,
  doc,
}) => {
  refresh(tagsForProductDelete(Number(id), doc));
};
