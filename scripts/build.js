// The build: on Vercel's Production and Preview builds, apply Payload's pending
// migrations to that environment's database first; on Preview builds, then
// create or update the automation user (issue #55); then build Next.js.
// If a step fails, the build fails and the previous deployment stays live.
// CI and local builds skip the database steps. Every build reads the catalog
// through DATABASE_URL, since it prerenders a product page (issue #47).
import { spawnSync } from "node:child_process";

function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const env = process.env.VERCEL_ENV;

if (env === "production" || env === "preview") {
  if (!process.env.DATABASE_URL_UNPOOLED || !process.env.PAYLOAD_SECRET) {
    console.error(
      `${env} build: DATABASE_URL_UNPOOLED and PAYLOAD_SECRET must be set to run migrations.`,
    );
    process.exit(1);
  }
  run(["scripts/payload.js", "migrate"]);
}

if (env === "preview") {
  run(["scripts/payload.js", "run", "scripts/seed-automation-user.ts"]);
}

run(["node_modules/next/dist/bin/next", "build"]);
