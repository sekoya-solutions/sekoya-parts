// The origin that language tags are built on (issue #73).
import { describe, expect, it } from "vitest";
import { siteUrl } from "../site/site-url.ts";

describe("siteUrl", () => {
  it("uses the production domain in production", () => {
    expect(
      siteUrl({
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "sekoya-parts.vercel.app",
        VERCEL_URL: "sekoya-parts-abc.vercel.app",
      }).href,
    ).toBe("https://sekoya-parts.vercel.app/");
  });

  it("uses the branch address on a preview, else the deployment address", () => {
    expect(
      siteUrl({
        VERCEL_ENV: "preview",
        VERCEL_BRANCH_URL: "sekoya-parts-git-feat.vercel.app",
        VERCEL_URL: "sekoya-parts-abc.vercel.app",
      }).href,
    ).toBe("https://sekoya-parts-git-feat.vercel.app/");
    expect(
      siteUrl({
        VERCEL_ENV: "preview",
        VERCEL_URL: "sekoya-parts-abc.vercel.app",
      }).href,
    ).toBe("https://sekoya-parts-abc.vercel.app/");
  });

  it("uses localhost outside Vercel", () => {
    expect(siteUrl({}).href).toBe("http://localhost:3000/");
    expect(siteUrl({ PORT: "3100" }).href).toBe("http://localhost:3100/");
  });
});
