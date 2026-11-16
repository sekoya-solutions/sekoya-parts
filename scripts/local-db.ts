// The throwaway PostgreSQL of npm run test:e2e:local (issue #156): enough
// connections for every build worker's Payload pool. The production build
// prerenders in up to one worker per CPU, each with a pg pool of up to 10
// connections (pg-pool's default), so a 32-CPU machine could open far more
// than PostgreSQL's default of 100 ("sorry, too many clients already").
// The CPU count bounds the workers, whatever Next.js's own cap; the margin
// covers the migration, the generator and the test server.

/** Connections one Payload instance's pg pool may open. */
export const POOL_SIZE = 10;

/** Connections beyond the build's workers. */
export const MARGIN = 20;

export const localMaxConnections = (cpus: number): number =>
  Math.max(100, Math.max(1, cpus) * POOL_SIZE + MARGIN);
