// The local test commands' environment and cluster folders (issue #185).
import { basename, dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { clusterFolder, runEnvironment } from "../scripts/local-cluster.ts";
import { isLocalDatabase } from "./local-database.ts";

const example = [
  "# A comment",
  "DATABASE_URL=",
  "DEEPL_API_KEY=",
  "ALGOLIA_ADMIN_KEY=",
  "",
].join("\n");

describe("runEnvironment", () => {
  const base = {
    NODE_ENV: "test",
    PATH: "/bin",
    DATABASE_URL: "postgres://neon.example/dev",
    DEEPL_API_KEY: "real:fx",
    VERCEL_ENV: "production",
    VERCEL_AUTOMATION_BYPASS_SECRET: "secret",
  } as const;

  it("empties every variable .env.example names, so .env.local cannot set it", () => {
    const env = runEnvironment({}, base, example);
    expect(env.DATABASE_URL).toBe("");
    expect(env.DEEPL_API_KEY).toBe("");
    expect(env.ALGOLIA_ADMIN_KEY).toBe("");
    expect(env.PATH).toBe("/bin");
  });

  it("keeps the values the run gives", () => {
    const env = runEnvironment(
      { DATABASE_URL: "postgres://127.0.0.1:5000/sekoya" },
      base,
      example,
    );
    expect(env.DATABASE_URL).toBe("postgres://127.0.0.1:5000/sekoya");
  });

  it("drops every Vercel variable", () => {
    const env = runEnvironment({}, base, example);
    expect(
      Object.keys(env).filter((name) => name.startsWith("VERCEL_")),
    ).toEqual([]);
  });
});

describe("clusterFolder", () => {
  it("gives each command its own folder", () => {
    expect(clusterFolder("test")).not.toBe(clusterFolder("e2e"));
    expect(basename(clusterFolder("e2e"))).toBe("e2e-postgres");
    expect(basename(dirname(clusterFolder("e2e")))).toBe(".tools");
  });
});

describe("isLocalDatabase", () => {
  it("accepts this machine's databases only", () => {
    expect(isLocalDatabase("postgres://u:p@127.0.0.1:5432/sekoya")).toBe(true);
    expect(isLocalDatabase("postgres://u:p@localhost:5432/sekoya")).toBe(true);
    expect(
      isLocalDatabase("postgres://u:p@ep-x.eu-central-1.aws.neon.tech/dev"),
    ).toBe(false);
    expect(isLocalDatabase("")).toBe(false);
  });
});
