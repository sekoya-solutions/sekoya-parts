// Who may use Payload's API (docs/adr/0014-customer-accounts.md, issue #176).
// Every access rule of every collection and global in the resolved config,
// Payload's own included, refuses a visitor and a user signed in to another
// collection, as a customer will be. Payload's default rule lets any signed-in
// user in, so this test fails on a collection that sets no rules, and again if
// a Payload upgrade adds a collection with the default. Resolving the config
// opens no database connection.

import type { PayloadRequest } from "payload";
import { describe, expect, it } from "vitest";
import { EDITOR_COLLECTION, isEditor } from "../cms/access.ts";
import config from "../payload.config.ts";

const resolved = await config;

const editor = { id: 1, collection: EDITOR_COLLECTION, email: "e@x.invalid" };
const customer = { id: 1, collection: "customers", username: "demo" };

/** Payload's own collections that refuse everyone, editors included. */
const CLOSED_TO_ALL = new Set(["payload-kv"]);

/** The project's own collections and globals: editors may do everything. */
const PROJECT_COLLECTIONS = [
  "brands",
  "categories",
  "products",
  "promotion-codes",
  "promotions",
  "users",
];
const PROJECT_GLOBALS = ["shop-settings"];

type Rule = (args: { req: PayloadRequest }) => unknown;

function rules(access: object | undefined): [string, Rule][] {
  return Object.entries(access ?? {}).filter(
    (entry): entry is [string, Rule] => typeof entry[1] === "function",
  );
}

async function decide(rule: Rule, user: object | null): Promise<unknown> {
  // Payload's default unlock rule reads the admin's collection from the config.
  const req = { user, payload: { config: resolved } };
  return rule({ req: req as unknown as PayloadRequest });
}

const targets = [
  ...resolved.collections.map((c) => ({ kind: "collection", ...c })),
  ...resolved.globals.map((g) => ({ kind: "global", ...g })),
];

describe("isEditor", () => {
  it("accepts a user of the editors' collection only", () => {
    expect(isEditor(editor)).toBe(true);
    expect(isEditor(customer)).toBe(false);
    expect(isEditor({ id: 1 })).toBe(false);
    expect(isEditor({ id: 1, collection: "Users" })).toBe(false);
    expect(isEditor(null)).toBe(false);
    expect(isEditor(undefined)).toBe(false);
    expect(isEditor("users")).toBe(false);
  });
});

describe("Payload's access rules", () => {
  it("cover the project's collections and globals", () => {
    const slugs = targets.map((t) => t.slug);
    for (const slug of [...PROJECT_COLLECTIONS, ...PROJECT_GLOBALS])
      expect(slugs).toContain(slug);
  });

  for (const target of targets) {
    describe(`${target.kind} ${target.slug}`, () => {
      const list = rules(target.access);

      it("has access rules", () => {
        expect(list.length).toBeGreaterThan(0);
      });

      for (const [operation, rule] of list) {
        it(`refuses ${operation} to a visitor and to a customer`, async () => {
          // false, not a query: a query would still let them reach documents.
          expect(await decide(rule, null)).toBe(false);
          expect(await decide(rule, customer)).toBe(false);
        });

        if (CLOSED_TO_ALL.has(target.slug)) continue;
        it(`allows ${operation} to an editor`, async () => {
          const decision = await decide(rule, editor);
          if (
            PROJECT_COLLECTIONS.includes(target.slug) ||
            PROJECT_GLOBALS.includes(target.slug)
          )
            expect(decision).toBe(true);
          else expect(decision).toBeTruthy();
        });
      }
    });
  }
});
