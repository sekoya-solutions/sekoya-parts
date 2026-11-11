import type { CollectionConfig } from "payload";

// Admin accounts for /admin, with Payload's own sign-in (docs/adr/0006-content-management.md).
export const Users: CollectionConfig = {
  slug: "users",
  admin: { useAsTitle: "email" },
  auth: true,
  fields: [],
};
