// GET /api/search?lang=<lang>&q=<query> (docs/adr/0010-search.md, issue
// #113): where the header's search box sends its form. A Route Handler, so it
// answers with a real 307 before any page renders: with Cache Components, a
// page that reads the query streams after its shell, so its status is always
// 200 and a redirect from it needs the browser's scripts.
//
// 1. A query whose search key equals exactly one model's goes straight to
//    that model's page, in the form's language.
// 2. Any other query goes to that language's results page, which lists the
//    matching models.
import config from "@payload-config";
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import type { NextRequest } from "next/server";
import { getPayload } from "payload";
import { isLocale, modelPath, searchPath } from "../../../../site/addresses.ts";
import { findModels } from "../../../../site/model-search.ts";
import { queryOf, searchKey } from "../../../../site/search-key.ts";

/** A temporary redirect: the same query may lead elsewhere after a catalog change. */
const redirectTo = (request: NextRequest, path: string) =>
  new Response(null, {
    status: 307,
    headers: {
      Location: new URL(path, request.nextUrl).toString(),
      "Cache-Control": "private, no-store",
    },
  });

export async function GET(request: NextRequest): Promise<Response> {
  const params = request.nextUrl.searchParams;
  const lang = params.get("lang") ?? "";
  if (!isLocale(lang))
    return new Response("Unknown language.", { status: 404 });
  const query = queryOf(params.get("q") ?? undefined);
  const key = query ? searchKey(query) : null;
  if (key) {
    const payload = await getPayload({ config });
    const db = (payload.db as unknown as PostgresAdapter).drizzle;
    // Exact matches come first, so two rows tell one match from several.
    const [first, second] = await findModels(db, key, 2);
    if (first?.exact && !second?.exact)
      return redirectTo(request, modelPath(lang, first));
  }
  return redirectTo(request, searchPath(lang, query));
}
