// The results page's Algolia query (docs/adr/0010-search.md, issue #119):
// its body, connection, visitor token and failure paths, with a fake fetch.
import { describe, expect, it } from "vitest";
import { locales } from "../cms/locales.ts";
import {
  PART_RESULTS,
  partsQuery,
  type SearchConnection,
  searchConnectionFromEnvironment,
  searchParts,
  visitorToken,
} from "../site/algolia-search.ts";

const env = {
  ALGOLIA_APP_ID: "APP",
  ALGOLIA_SEARCH_KEY: "search-key",
  ALGOLIA_ENVIRONMENT: "preview",
};

describe("the search connection", () => {
  it("uses the Distributed Search Network host and the environment's index", () => {
    const connection = searchConnectionFromEnvironment(env);
    expect(connection?.client.baseUrl).toBe("https://APP-dsn.algolia.net");
    expect(connection?.client.key).toBe("search-key");
    expect(connection?.index).toBe("products_preview");
  });

  it("is absent without a key, an application or a known environment", () => {
    expect(
      searchConnectionFromEnvironment({ ...env, ALGOLIA_SEARCH_KEY: "" }),
    ).toBeNull();
    expect(
      searchConnectionFromEnvironment({ ...env, ALGOLIA_APP_ID: undefined }),
    ).toBeNull();
    expect(
      searchConnectionFromEnvironment({ ...env, ALGOLIA_ENVIRONMENT: "prod" }),
    ).toBeNull();
  });

  it("takes the tests' fake host locally, never on Vercel", () => {
    const fake = { ...env, ALGOLIA_SEARCH_URL: "http://127.0.0.1:3101" };
    expect(searchConnectionFromEnvironment(fake)?.client.baseUrl).toBe(
      "http://127.0.0.1:3101",
    );
    expect(
      searchConnectionFromEnvironment({ ...fake, VERCEL_ENV: "production" }),
    ).toBeNull();
  });
});

describe("the visitor token", () => {
  it("is 32 hexadecimal characters, the same for the same visitor", () => {
    const token = visitorToken("203.0.113.7", "secret");
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(visitorToken("203.0.113.7", "secret")).toBe(token);
  });

  it("differs by visitor and by secret, and never holds the address", () => {
    const token = visitorToken("203.0.113.7", "secret");
    expect(visitorToken("203.0.113.8", "secret")).not.toBe(token);
    expect(visitorToken("203.0.113.7", "other")).not.toBe(token);
    expect(token).not.toContain("203");
  });

  it("refuses an empty secret, which would make it a plain hash", () => {
    expect(() => visitorToken("203.0.113.7", "")).toThrow();
  });
});

describe("the query", () => {
  it("searches only the visitor's language's name, plus reference, models and brand", () => {
    for (const locale of locales) {
      const body = partsQuery(locale, "joint");
      expect(body.restrictSearchableAttributes).toEqual([
        `name_${locale}`,
        "reference",
        "models",
        "brand",
      ]);
      expect(body.queryLanguages).toEqual([locale]);
      expect(body.attributesToRetrieve).toEqual([
        "reference",
        "brand",
        "priceCents",
        `name_${locale}`,
        `path_${locale}`,
      ]);
    }
  });

  it("asks for no highlighting and turns analytics off", () => {
    const body = partsQuery("fr", "joint");
    expect(body).toMatchObject({
      query: "joint",
      attributesToHighlight: [],
      attributesToSnippet: [],
      hitsPerPage: PART_RESULTS,
      analytics: false,
      clickAnalytics: false,
      enablePersonalization: false,
    });
  });
});

/** A connection whose fetch answers with `answer` and keeps the calls. */
function fakeConnection(answer: (init: RequestInit) => Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const connection: SearchConnection = {
    index: "products_dev",
    client: {
      appId: "APP",
      key: "search-key",
      baseUrl: "https://APP-dsn.algolia.net",
      fetch: async (url, init = {}) => {
        calls.push({ url: String(url), init });
        return answer(init);
      },
    },
  };
  return { connection, calls };
}

const hit = (overrides: Record<string, unknown> = {}) => ({
  objectID: "7",
  reference: "SP000007",
  brand: "Motoon",
  priceCents: 1990,
  name_fr: "Joint Motoon SP000007",
  path_fr: "/fr/joint/joint-motoon-sp000007",
  ...overrides,
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status });

const search = { locale: "fr" as const, query: "joint", token: "a".repeat(32) };

describe("searchParts", () => {
  it("sends one query to the index with the key and the visitor token", async () => {
    const { connection, calls } = fakeConnection(async () =>
      json(200, { hits: [hit()], nbHits: 1, processingTimeMS: 2 }),
    );
    const result = await searchParts(connection, search);
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe(
      "https://APP-dsn.algolia.net/1/indexes/products_dev/query",
    );
    const headers = call?.init.headers as Record<string, string>;
    expect(headers["X-Algolia-API-Key"]).toBe("search-key");
    expect(headers["X-Algolia-UserToken"]).toBe(search.token);
    expect(JSON.parse(String(call?.init.body))).toEqual(
      partsQuery("fr", "joint"),
    );
    expect(result).toEqual({
      status: "ok",
      parts: [
        {
          reference: "SP000007",
          brand: "Motoon",
          priceCents: 1990,
          name: "Joint Motoon SP000007",
          path: "/fr/joint/joint-motoon-sp000007",
        },
      ],
      total: 1,
      processingMs: 2,
    });
  });

  it("drops a hit with a missing field or a path outside the page's language", async () => {
    const { connection } = fakeConnection(async () =>
      json(200, {
        hits: [
          hit({ priceCents: undefined }),
          hit({ path_fr: "https://elsewhere.test/" }),
          hit({ path_fr: "/en/seal/x" }),
          hit(),
        ],
        nbHits: 4,
        processingTimeMS: 1,
      }),
    );
    const result = await searchParts(connection, search);
    expect(result.status === "ok" && result.parts).toHaveLength(1);
  });

  it("is unavailable, never throwing, when Algolia refuses or fails", async () => {
    for (const status of [429, 403, 500]) {
      const { connection } = fakeConnection(async () =>
        json(status, { message: "no" }),
      );
      expect(await searchParts(connection, search)).toEqual({
        status: "unavailable",
        reason: `status ${status}`,
      });
    }
    const { connection } = fakeConnection(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await searchParts(connection, search)).toEqual({
      status: "unavailable",
      reason: "network",
    });
  });

  it("gives up after its time limit", async () => {
    const { connection } = fakeConnection(
      (init) =>
        new Promise((_, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason),
          );
        }),
    );
    expect(await searchParts(connection, search, 50)).toEqual({
      status: "unavailable",
      reason: "timeout",
    });
  });

  it("is unavailable without a connection, sending nothing", async () => {
    expect(await searchParts(null, search)).toEqual({
      status: "unavailable",
      reason: "not configured",
    });
  });
});
