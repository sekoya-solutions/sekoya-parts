// GET / (issue #191, docs/adr/0011-languages-and-seo.md): the bare domain
// sends each visitor to a home page, the one of the language last picked in
// the language switch, else of the browser's language, else French. A Route
// Handler, so the 307 leaves before any page renders. Reading the request's
// headers keeps it out of the build's prerendering, and `private, no-store`
// keeps Vercel's cache and any shared cache from handing one visitor's
// language to another. The bare domain stays the home pages' x-default.
import type { NextRequest } from "next/server";
import { homePath } from "../../site/addresses.ts";
import { bareDomainLanguage } from "../../site/language-choice.ts";

export function GET(request: NextRequest): Response {
  const locale = bareDomainLanguage({
    cookies: request.headers.get("cookie"),
    acceptLanguage: request.headers.get("accept-language"),
  });
  return new Response(null, {
    status: 307,
    headers: {
      Location: new URL(homePath(locale), request.nextUrl).toString(),
      "Cache-Control": "private, no-store",
      Vary: "Cookie, Accept-Language",
    },
  });
}
