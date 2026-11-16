// Payload enforces the editor-only rules (issue #176): through its Local API
// with `overrideAccess: false`, as its REST API calls it, a user signed in to
// another collection, as a customer will be, is refused on the catalog, the
// shop settings and Payload's own collections, while an editor is not.
// tests/payload-access.test.ts checks the rules themselves; this test proves
// Payload reads them from the config at request time. Needs a migrated
// database. Its writes target no existing row, so even with the rules missing
// it changes nothing: a first version, run without them, deleted every
// migration record of the dev database.

import { Forbidden, getPayload, type Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EDITOR_COLLECTION } from "../cms/access.ts";
import config from "../payload.config.ts";

// No silent skip: without a database this test fails.
for (const name of ["DATABASE_URL", "PAYLOAD_SECRET"]) {
  if (!process.env[name]) throw new Error(`${name} must be set for this test.`);
}

// Payload reads only `collection` to decide; neither user is looked up.
const editor = { id: 1, collection: EDITOR_COLLECTION };
const customer = { id: 1, collection: "customers" };

let payload: Payload;

beforeAll(async () => {
  payload = await getPayload({ config });
});

afterAll(async () => {
  await payload?.destroy();
});

const COLLECTIONS = [
  "products",
  "categories",
  "brands",
  "promotions",
  "promotion-codes",
  "users",
  "payload-migrations",
  "payload-locked-documents",
  "payload-preferences",
] as const;

describe("Payload refuses a customer", () => {
  it.each(COLLECTIONS)("reading %s", async (collection) => {
    await expect(
      payload.find({
        collection,
        limit: 1,
        overrideAccess: false,
        user: customer,
      }),
    ).rejects.toBeInstanceOf(Forbidden);
  });

  // No migration has this name: refused, or a no-op if the rule is missing.
  it("deleting migration records", async () => {
    await expect(
      payload.delete({
        collection: "payload-migrations",
        where: { name: { equals: "issue-176-no-such-migration" } },
        overrideAccess: false,
        user: customer,
      }),
    ).rejects.toBeInstanceOf(Forbidden);
  });

  // No lock has this global's slug: refused, or a no-op if the rule is missing.
  it("removing a lock", async () => {
    await expect(
      payload.delete({
        collection: "payload-locked-documents",
        where: { globalSlug: { equals: "issue-176-no-such-global" } },
        overrideAccess: false,
        user: customer,
      }),
    ).rejects.toBeInstanceOf(Forbidden);
  });

  it("reading the shop settings", async () => {
    await expect(
      payload.findGlobal({
        slug: "shop-settings",
        overrideAccess: false,
        user: customer,
      }),
    ).rejects.toBeInstanceOf(Forbidden);
  });
});

describe("Payload lets an editor in", () => {
  it.each(["products", "payload-migrations"] as const)(
    "reading %s",
    async (collection) => {
      const result = await payload.find({
        collection,
        limit: 1,
        overrideAccess: false,
        user: editor,
      });
      expect(result.totalDocs).toBeGreaterThan(0);
    },
  );

  it("reading the shop settings", async () => {
    const settings = await payload.findGlobal({
      slug: "shop-settings",
      overrideAccess: false,
      user: editor,
    });
    expect(settings.deliveryCents).toBeGreaterThanOrEqual(0);
  });
});
