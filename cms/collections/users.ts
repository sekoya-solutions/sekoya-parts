import type { CollectionConfig } from "payload";
import { EDITOR_COLLECTION, editorCollectionAccess } from "../access.ts";

// Admin accounts for /admin, with Payload's own sign-in (docs/adr/0006-content-management.md).
// API keys serve the automation user that only preview builds create
// (scripts/seed-automation-user.ts, issue #55); production has no user with a key.
// Only editors read or change them (issue #176), so a customer signed in to
// another collection never sees an editor's address.
export const Users: CollectionConfig = {
  slug: EDITOR_COLLECTION,
  access: editorCollectionAccess,
  admin: { useAsTitle: "email" },
  auth: { useAPIKey: true },
  fields: [],
};
