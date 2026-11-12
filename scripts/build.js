// The build: on Vercel's Production builds only, apply Payload's pending
// migrations to the production database first, then build Next.js.
// If a migration fails, the build fails and the previous deployment stays live.
// Preview, CI and local builds skip the migrations. Every build reads the
// catalog through DATABASE_URL, since it prerenders a product page (issue #47).
import { spawnSync } from "node:child_process";

function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (process.env.VERCEL_ENV === "production") {
  if (!process.env.DATABASE_URL_UNPOOLED || !process.env.PAYLOAD_SECRET) {
    console.error(
      "Production build: DATABASE_URL_UNPOOLED and PAYLOAD_SECRET must be set to run migrations.",
    );
    process.exit(1);
  }
  run(["scripts/payload.js", "migrate"]);
}

run(["node_modules/next/dist/bin/next", "build"]);
