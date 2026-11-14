// Creates each environment's Algolia keys (docs/adr/0010-search.md, issue
// #115), with the owner's Admin API Key from .env.local. Run once, and again
// safely: a key that already exists with the right rights is reused, and one
// with other rights stops the script rather than being changed.
//
// Usage: npm run algolia:keys
//
// It prints no key. It writes:
// - the dev keys into .env.local, when they are not there yet;
// - every environment's variables into .env.algolia.local (git-ignored), for
//   Vercel's Production and Preview environments.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import {
  type AlgoliaClient,
  algoliaRequest,
  type ExistingKey,
  environmentKeys,
  keyMatches,
} from "../site/algolia.ts";
import { indexEnvironments } from "../site/algolia-record.ts";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be set in .env.local.`);
  return value;
}

const client: AlgoliaClient = {
  appId: required("ALGOLIA_APP_ID"),
  key: required("ALGOLIA_ADMIN_KEY"),
};

const { keys } = await algoliaRequest<{ keys: ExistingKey[] }>(
  client,
  "GET",
  "/1/keys",
);

const lines: string[] = [];
const dev: Record<string, string> = {};
for (const environment of indexEnvironments) {
  const values: Record<string, string> = {};
  for (const [role, spec] of Object.entries(environmentKeys(environment))) {
    const existing = keys.filter((k) => k.description === spec.description);
    if (existing.length > 1) {
      throw new Error(`Several keys are named "${spec.description}".`);
    }
    let value: string;
    if (existing[0]) {
      if (!keyMatches(existing[0], spec)) {
        throw new Error(
          `The key "${spec.description}" exists with other rights: fix or delete it in the dashboard.`,
        );
      }
      value = existing[0].value;
      console.log(`${spec.description}: reused`);
    } else {
      ({ key: value } = await algoliaRequest<{ key: string }>(
        client,
        "POST",
        "/1/keys",
        spec,
      ));
      console.log(`${spec.description}: created`);
    }
    values[role === "write" ? "ALGOLIA_WRITE_KEY" : "ALGOLIA_SEARCH_KEY"] =
      value;
  }
  lines.push(
    `# ${environment}`,
    `ALGOLIA_ENVIRONMENT=${environment}`,
    `ALGOLIA_APP_ID=${client.appId}`,
    ...Object.entries(values).map(([name, value]) => `${name}=${value}`),
    "",
  );
  if (environment === "dev")
    Object.assign(dev, { ALGOLIA_ENVIRONMENT: "dev", ...values });
}

writeFileSync(".env.algolia.local", `${lines.join("\n")}`, { mode: 0o600 });
console.log("Wrote .env.algolia.local: the variables for Vercel.");

const local = readFileSync(".env.local", "utf8");
const missing = Object.entries(dev).filter(
  ([name]) => !new RegExp(`^${name}=`, "m").test(local),
);
if (missing.length > 0) {
  appendFileSync(
    ".env.local",
    `${local.endsWith("\n") ? "" : "\n"}${missing.map(([n, v]) => `${n}=${v}`).join("\n")}\n`,
  );
  console.log(`Added ${missing.map(([n]) => n).join(", ")} to .env.local.`);
} else {
  console.log(".env.local already holds the dev variables.");
}
