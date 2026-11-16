// The local test database's connection limit (issue #156).
import { describe, expect, it } from "vitest";
import { localMaxConnections, MARGIN, POOL_SIZE } from "../scripts/local-db.ts";

describe("localMaxConnections", () => {
  it("allows every CPU's worker a full pool, plus a margin", () => {
    // The owner's machine: 32 CPUs, 14 build workers seen, 140 connections.
    expect(localMaxConnections(32)).toBe(32 * POOL_SIZE + MARGIN);
    expect(localMaxConnections(32)).toBeGreaterThan(14 * POOL_SIZE);
  });

  it("never goes below PostgreSQL's default of 100", () => {
    expect(localMaxConnections(4)).toBe(100);
    expect(localMaxConnections(0)).toBe(100);
  });
});
