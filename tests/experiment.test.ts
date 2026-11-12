// Experiment 2's temporary page answers only on Vercel previews, and only for
// the counts the experiment measures (issue #57).
import { describe, expect, it } from "vitest";
import { experimentReferenceCount } from "../site/experiment.ts";

describe("experimentReferenceCount", () => {
  it.each([
    ["250", 250],
    ["500", 500],
    ["1000", 1000],
    ["2000", 2000],
  ])("gives %s on a preview", (raw, count) => {
    expect(experimentReferenceCount(raw, { VERCEL_ENV: "preview" })).toBe(
      count,
    );
  });

  it.each([
    ["production", { VERCEL_ENV: "production" }],
    ["development", { VERCEL_ENV: "development" }],
    ["no Vercel environment", {}],
  ])("gives nothing on %s", (_, env) => {
    expect(experimentReferenceCount("500", env)).toBeNull();
  });

  it.each(["0", "1", "750", "1,000", "01000", "1e3", "2000 ", "99999999", ""])(
    "gives nothing for the count %j",
    (raw) => {
      expect(
        experimentReferenceCount(raw, { VERCEL_ENV: "preview" }),
      ).toBeNull();
    },
  );
});
