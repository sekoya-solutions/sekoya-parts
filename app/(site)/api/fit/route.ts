// GET /api/fit?lang=<lang>&part=<product reference>&q=<model reference>
// (issue #161): the answer the product page's "Does it fit my appliance?"
// component shows under its form, as JSON (site/fit.ts). Without JavaScript
// the same form leads to the result page instead
// (app/(site)/[lang]/[section]/page.tsx). Not cached: each pair is different,
// and storing them would fill the Runtime Cache with entries rarely read
// again, as for the search page.
import config from "@payload-config";
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import type { NextRequest } from "next/server";
import { getPayload } from "payload";
import { FIT_PARAMS, isLocale } from "../../../../site/addresses.ts";
import { checkFit, fitResponse } from "../../../../site/fit.ts";

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });

export async function GET(request: NextRequest): Promise<Response> {
  const params = request.nextUrl.searchParams;
  const lang = params.get("lang") ?? "";
  if (!isLocale(lang)) return json({ status: "invalid" }, 400);
  const part = params.get(FIT_PARAMS.part) ?? "";
  const q = params.get(FIT_PARAMS.q) ?? "";
  const payload = await getPayload({ config });
  const db = (payload.db as unknown as PostgresAdapter).drizzle;
  const answer = await checkFit(db, part, q);
  return json(
    fitResponse(answer, lang),
    answer.status === "invalid" ? 400 : 200,
  );
}
