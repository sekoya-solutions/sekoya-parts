// Runs scripts/seed-automation-user.ts as a Preview build does, twice, and
// checks that the key it sets is the one Payload accepts (issue #55).
// It writes a user, so it runs only against a local database, as in CI: never
// against a Neon branch from a developer's .env.local.
import { spawnSync } from "node:child_process";
import { getPayload, type Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AUTOMATION_EMAIL } from "../cms/automation-user.ts";
import config from "../payload.config.ts";

const host = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname;
  } catch {
    return "";
  }
})();
const localDatabase = host === "localhost" || host === "127.0.0.1";

function seed(apiKey: string): string {
  const result = spawnSync(
    process.execPath,
    ["scripts/payload.js", "run", "scripts/seed-automation-user.ts"],
    {
      env: {
        ...process.env,
        VERCEL_ENV: "preview",
        AUTOMATION_API_KEY: apiKey,
      },
      encoding: "utf8",
    },
  );
  expect(result.status, result.stderr).toBe(0);
  return result.stdout;
}

async function userForKey(payload: Payload, apiKey: string) {
  const headers = new Headers({ Authorization: `users API-Key ${apiKey}` });
  return (await payload.auth({ headers })).user;
}

describe.skipIf(!localDatabase)(
  "the automation user seed, on a local database only",
  () => {
    let payload: Payload;
    const first = "a".repeat(40);
    const second = "b".repeat(40);

    beforeAll(async () => {
      payload = await getPayload({ config });
      await payload.delete({
        collection: "users",
        where: { email: { equals: AUTOMATION_EMAIL } },
      });
    });

    afterAll(async () => {
      await payload?.delete({
        collection: "users",
        where: { email: { equals: AUTOMATION_EMAIL } },
      });
      await payload?.destroy();
    });

    it("creates the user, whose key then authenticates", async () => {
      expect(seed(first)).toContain("Automation user: created.");
      expect((await userForKey(payload, first))?.email).toBe(AUTOMATION_EMAIL);
    });

    it("sets the key again on a second run, and the old key stops working", async () => {
      expect(seed(second)).toContain("Automation user: key updated.");
      expect((await userForKey(payload, second))?.email).toBe(AUTOMATION_EMAIL);
      expect(await userForKey(payload, first)).toBeNull();
      const { totalDocs } = await payload.count({
        collection: "users",
        where: { email: { equals: AUTOMATION_EMAIL } },
      });
      expect(totalDocs).toBe(1);
    });
  },
);
