// Who may run the translation sweep (issue #104): a signed-in user, or the
// daily cron with CRON_SECRET; anyone else gets 401.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deeplFromEnvironment,
  mayRun,
  TRANSLATION_RUN_PATH,
} from "../cms/translation/endpoint.ts";

describe("mayRun", () => {
  const secret = "s3cret-value";

  it("lets a signed-in user run it, with or without a header", () => {
    expect(mayRun({ user: { id: 1 } }, undefined)).toBe(true);
    expect(mayRun({ user: { id: 1 }, authorization: "Bearer x" }, secret)).toBe(
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

  it("refuses everyone but signed-in users when no secret is set", () => {
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

describe("the daily cron", () => {
  it("calls the run endpoint once a day, as Hobby allows", () => {
    const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as {
      crons?: { path: string; schedule: string }[];
    };
    expect(vercel.crons).toEqual([
      { path: `/api${TRANSLATION_RUN_PATH}`, schedule: "0 3 * * *" },
    ]);
  });
});
