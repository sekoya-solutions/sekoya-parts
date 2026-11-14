// Measures search latency on a deployment (docs/adr/0010-search.md, issue
// #119): a few single requests, spaced out, never a burst (AGENTS.md).
//
//   node --env-file=.env.local scripts/search-latency.ts <deployment URL> [--idle]
//
// Each round sends the search route a query, as the search box does, then
// reads the results page it redirects to. The route's Server-Timing header
// gives the exact-match step's model lookup; the results page's data
// attributes give its model lookup and its Algolia query, run at once. With
// --idle, the script first waits six minutes, past Neon's five-minute
// suspension, so the first round meets a suspended compute: nothing a script
// can observe says when Neon suspends, hence a fixed wait, and only when the
// deployment had no other traffic meanwhile.
//
// A protected Preview needs the "Agent checks" bypass secret,
// VERCEL_AUTOMATION_BYPASS_SECRET, sent as a header. Each round spends one
// Algolia search. The script stops at the first 403, 429 or challenge.
import { modelRows } from "../catalog/generator.ts";

const ROUNDS = 6;
const SPACING_MS = 30_000;
const IDLE_MS = 6 * 60_000;

const [base, ...flags] = process.argv.slice(2);
if (!base) throw new Error("Give the deployment's URL.");
const origin = new URL(base).origin;
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
const headers: Record<string, string> = bypass
  ? { "x-vercel-protection-bypass": bypass }
  : {};

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** One request, timed to its full body; stops the script on a mitigation. */
async function timed(path: string) {
  const start = performance.now();
  const response = await fetch(new URL(path, origin), {
    headers,
    redirect: "manual",
  });
  const body = await response.text();
  const ms = Math.round(performance.now() - start);
  if (
    response.status === 403 ||
    response.status === 429 ||
    response.headers.has("retry-after") ||
    response.headers.has("x-vercel-mitigated")
  ) {
    console.error(`Stopped: ${response.status} on ${path}. No retry.`);
    process.exit(1);
  }
  return { response, body, ms };
}

const attribute = (body: string, name: string) =>
  new RegExp(`${name}="([^"]*)"`).exec(body)?.[1] ?? null;

/** A query that is no model's reference, and a model's exact reference. */
const [, , exactReference] = modelRows(1, "full").next().value as [
  number,
  number,
  string,
  string,
];
const queries = { words: "joint", exact: exactReference };

if (flags.includes("--idle")) {
  console.error("Waiting six minutes, past Neon's suspension...");
  await wait(IDLE_MS);
}

for (let round = 1; round <= ROUNDS; round++) {
  if (round > 1) await wait(SPACING_MS);
  // The last round tests the exact-match redirect, which spends no search.
  const query = round === ROUNDS ? queries.exact : queries.words;
  const route = await timed(
    `/api/search?lang=fr&q=${encodeURIComponent(query)}`,
  );
  const timing = route.response.headers.get("server-timing") ?? "";
  const line: Record<string, unknown> = {
    round,
    query: round === ROUNDS ? "exact reference" : query,
    routeStatus: route.response.status,
    routeMs: route.ms,
    routeModelsMs: Number(
      /models;dur=([\d.]+)/.exec(timing)?.[1] ?? Number.NaN,
    ),
  };
  const location = route.response.headers.get("location");
  if (round < ROUNDS && location) {
    const page = await timed(location);
    Object.assign(line, {
      pageStatus: page.response.status,
      pageMs: page.ms,
      pageModelsMs: Number(attribute(page.body, "data-models-ms")),
      pagePartsMs: Number(attribute(page.body, "data-parts-ms")),
      parts: attribute(page.body, "data-parts-status"),
    });
  }
  console.log(JSON.stringify(line));
}
