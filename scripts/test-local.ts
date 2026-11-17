// Runs the unit tests on the owner's machine as CI's "Generator and tests"
// job runs them (issue #185): a throwaway PostgreSQL 18 cluster from .tools/,
// Payload's migrations, the small catalog with seed 1, then Vitest. The
// cluster and its isolation from .env.local and Neon are shared with
// npm run test:e2e:local (scripts/local-cluster.ts). npm test still runs
// Vitest against the database .env.local names.
//
// Usage: npm run test:local [-- <Vitest arguments>]
// for example: npm run test:local -- tests/cart.test.ts
import {
  missingPostgres,
  run,
  stopIfMissing,
  withCluster,
} from "./local-cluster.ts";

stopIfMissing(missingPostgres());

await withCluster("test", {}, (env) => {
  run("npm", ["test", "--", ...process.argv.slice(2)], env);
});
