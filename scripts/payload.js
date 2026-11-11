// Runs Payload's command line over the direct (unpooled) database connection,
// as docs/adr/0005-database.md decides for migrations and bulk loads.
// Usage: npm run payload -- migrate
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const bin = fileURLToPath(
  new URL("../node_modules/payload/bin.js", import.meta.url),
);

const child = spawn(process.execPath, [bin, ...process.argv.slice(2)], {
  env: { ...process.env, PAYLOAD_DATABASE_DIRECT: "1" },
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
