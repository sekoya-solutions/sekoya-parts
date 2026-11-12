import type { CollectionConfig } from "payload";

// Admin accounts for /admin, with Payload's own sign-in (docs/adr/0006-content-management.md).
// API keys serve the automation user that only preview builds create
// (scripts/seed-automation-user.ts, issue #55); production has no user with a key.
export const Users: CollectionConfig = {
  slug: "users",
  admin: { useAsTitle: "email" },
  auth: { useAPIKey: true },
  fields: [],
};
