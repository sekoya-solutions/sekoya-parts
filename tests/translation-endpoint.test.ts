// Who may run the daily jobs (issues #104 and #176): a signed-in editor, or
// the daily cron with CRON_SECRET; anyone else gets 401, a customer included.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SALES_RUN_PATH } from "../cms/sales/endpoint.ts";
import { SEARCH_INDEX_RUN_PATH } from "../cms/search-index/endpoint.ts";
import {
  deeplFromEnvironment,
  mayRun,
  TRANSLATION_RUN_PATH,
} from "../cms/translation/endpoint.ts";

describe("mayRun", () => {
  const secret = "s3cret-value";

  const editor = { id: 1, collection: "users" };

  it("lets a signed-in editor run it, with or without a header", () => {
    expect(mayRun({ user: editor }, undefined)).toBe(true);
    expect(mayRun({ user: editor, authorization: "Bearer x" }, secret)).toBe(
      true,
    );
  });

  // Issue #176: a customer signs in to another collection.
  it.each([
    ["a customer", { id: 1, collection: "customers" }],
    ["a user with no collection", { id: 1 }],
    [
      "a user of a collection named like editors",
      { id: 1, collection: "Users" },
    ],
  ])("refuses %s without the secret", (_case, user) => {
    expect(mayRun({ user }, secret)).toBe(false);
    expect(mayRun({ user, authorization: "Bearer x" }, secret)).toBe(false);
    expect(mayRun({ user }, undefined)).toBe(false);
  });

  it("lets a customer's request with the cron's secret run it", () => {
    const user = { id: 1, collection: "customers" };
    expect(mayRun({ user, authorization: `Bearer ${secret}` }, secret)).toBe(
      true,
    );
  });

  it("lets the cron run it with the exact secret", () => {
    expect(mayRun({ authorization: `Bearer ${secret}` }, secret)).toBe(true);
  });

  it.each([
    ["no header", undefined],
    ["a wrong secret", "Bearer wrong-value!"],
    ["the secret without Bearer", secret],
    ["a longer secret", `Bearer ${secret}x`],
    ["an empty header", ""],
  ])("refuses %s", (_case, authorization) => {
    expect(mayRun({ authorization }, secret)).toBe(false);
  });

  it("refuses everyone but signed-in editors when no secret is set", () => {
    expect(mayRun({ authorization: "Bearer " }, "")).toBe(false);
    expect(mayRun({ authorization: "Bearer undefined" }, undefined)).toBe(
      false,
    );
  });
});

describe("deeplFromEnvironment", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns no client without a key, or with a blank one", () => {
    vi.stubEnv("DEEPL_API_KEY", "");
    expect(deeplFromEnvironment()).toBeNull();
    vi.stubEnv("DEEPL_API_KEY", "   ");
    expect(deeplFromEnvironment()).toBeNull();
  });

  it("trims the key", () => {
    vi.stubEnv("DEEPL_API_KEY", " abc:fx \n");
    expect(deeplFromEnvironment()).toEqual({ key: "abc:fx" });
  });
});

describe("the daily crons", () => {
  it("call the translation, search index and sale runs once a day, as Hobby allows", () => {
    const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as {
      crons?: { path: string; schedule: string }[];
    };
    expect(vercel.crons).toEqual([
      { path: `/api${TRANSLATION_RUN_PATH}`, schedule: "0 3 * * *" },
      { path: `/api${SEARCH_INDEX_RUN_PATH}`, schedule: "0 4 * * *" },
      // The sale rotation (issue #151).
      { path: `/api${SALES_RUN_PATH}`, schedule: "0 5 * * *" },
    ]);
  });
});
