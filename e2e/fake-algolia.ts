// A fake Algolia search host for the end-to-end tests (issue #119), so they
// spend no quota and need no key. Playwright starts it beside the site
// (playwright.config.ts), and the site's ALGOLIA_SEARCH_URL points here.
//
// It answers the one search call the results page sends, from records built
// like the real ones (site/algolia-record.ts) for the first products of the
// catalog the tests run against, and keeps each request, which the tests read
// back at GET /requests?query=<query>. Queries ending as FAKE_FAILURES says
// (e2e/fake-algolia-url.ts) fake Algolia's failures.
import { createServer } from "node:http";
import {
  brandRows,
  categories,
  isScaleName,
  productRows,
  slugify,
} from "../catalog/generator.ts";
import { locales } from "../cms/locales.ts";
import { buildRecord, type ProductRecord } from "../site/algolia-record.ts";
import { FAKE_ALGOLIA_PORT, FAKE_FAILURES } from "./fake-algolia-url.ts";

/** The fake's records: the first ordinary products of the tests' catalog. */
function records(): ProductRecord[] {
  const scale = process.env.CATALOG_SCALE ?? "small";
  if (!isScaleName(scale)) throw new Error(`Unknown scale "${scale}".`);
  const seed = Number(process.env.CATALOG_SEED ?? "1");
  const brands = new Map(
    brandRows(seed, scale).map(([id, name]) => [id, name]),
  );
  const byId = new Map(categories().map((c) => [c.id, c.names]));
  const result: ProductRecord[] = [];
  for (const [
    id,
    reference,
    brandId,
    categoryId,
    priceCents,
    showcase,
  ] of productRows(seed, scale)) {
    if (result.length === 50) break;
    if (showcase) continue;
    const names = byId.get(categoryId);
    if (!names) throw new Error(`No category ${categoryId}.`);
    result.push(
      buildRecord({
        id,
        reference,
        brand: brands.get(brandId) ?? "",
        categoryId,
        priceCents,
        showcase,
        showcaseNames: null,
        categoryNames: names,
        categorySlugs: Object.fromEntries(
          locales.map((locale) => [locale, slugify(names[locale])]),
        ) as typeof names,
        modelReferences: [],
      }),
    );
  }
  return result;
}

type Seen = { body: Record<string, unknown>; headers: Record<string, string> };

const index = records();
const seen = new Map<string, Seen[]>();

/** A record matches when one restricted attribute contains the query. */
function matches(record: ProductRecord, body: Record<string, unknown>) {
  const query = String(body.query ?? "").toLowerCase();
  const attributes = (body.restrictSearchableAttributes as string[]) ?? [];
  return attributes.some((attribute) => {
    const value = (record as Record<string, unknown>)[attribute];
    const values = Array.isArray(value) ? value : [value];
    return values.some((v) => String(v).toLowerCase().includes(query));
  });
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const send = (status: number, body: unknown) => {
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(body));
  };
  if (request.method === "GET" && url.pathname === "/") return send(200, {});
  if (request.method === "GET" && url.pathname === "/records")
    return send(200, index);
  if (request.method === "GET" && url.pathname === "/requests")
    return send(200, seen.get(url.searchParams.get("query") ?? "") ?? []);
  if (
    request.method !== "POST" ||
    !/^\/1\/indexes\/[^/]+\/query$/.test(url.pathname)
  )
    return send(404, { message: "Not faked." });
  let text = "";
  request.on("data", (chunk) => {
    text += chunk;
  });
  request.on("end", () => {
    const body = JSON.parse(text) as Record<string, unknown>;
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(request.headers))
      if (typeof value === "string") headers[name] = value;
    const query = String(body.query ?? "");
    seen.set(query, [...(seen.get(query) ?? []), { body, headers }]);
    // Longest ending first: " ---" also ends with " --" and " -".
    if (query.endsWith(FAKE_FAILURES.slow))
      return void setTimeout(
        () => send(200, { hits: [], nbHits: 0, processingTimeMS: 1 }),
        5_000,
      );
    if (query.endsWith(FAKE_FAILURES.limit))
      return send(429, { message: "Too many requests." });
    if (query.endsWith(FAKE_FAILURES.error))
      return send(500, { message: "Fake error." });
    const retrieve = (body.attributesToRetrieve as string[]) ?? [];
    const found = index.filter((record) => matches(record, body));
    const hits = found
      .slice(0, Number(body.hitsPerPage ?? 20))
      .map((record) =>
        Object.fromEntries(
          [...retrieve, "objectID"].map((field) => [
            field,
            (record as Record<string, unknown>)[field],
          ]),
        ),
      );
    send(200, { hits, nbHits: found.length, processingTimeMS: 1 });
  });
});

server.listen(FAKE_ALGOLIA_PORT, "127.0.0.1");
