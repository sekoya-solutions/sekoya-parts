// Only Vercel Preview builds create the automation user (issue #55).
import { describe, expect, it } from "vitest";
import { automationUserSkipReason } from "../cms/automation-user.ts";

const key = "k".repeat(32);

describe("automationUserSkipReason", () => {
  it("allows a Preview build with a long enough key", () => {
    expect(
      automationUserSkipReason({
        VERCEL_ENV: "preview",
        AUTOMATION_API_KEY: key,
      }),
    ).toBeNull();
  });

  it.each([
    ["production", { VERCEL_ENV: "production", AUTOMATION_API_KEY: key }],
    ["development", { VERCEL_ENV: "development", AUTOMATION_API_KEY: key }],
    ["local or CI", { AUTOMATION_API_KEY: key }],
  ])("refuses a %s environment, even with a key", (_, env) => {
    expect(automationUserSkipReason(env)).toBe("not a Vercel Preview build");
  });

  it("refuses a Preview build without a key", () => {
    expect(automationUserSkipReason({ VERCEL_ENV: "preview" })).toMatch(
      /not set/,
    );
  });

  it("refuses a short key", () => {
    expect(
      automationUserSkipReason({
        VERCEL_ENV: "preview",
        AUTOMATION_API_KEY: "short",
      }),
    ).toMatch(/shorter than 32/);
  });
});
