// The fit check's result page (issue #161), at
// /<lang>/<fit word>?part=<product reference>&q=<model reference>: where the
// product page's "Does it fit my appliance?" form leads without JavaScript.
// Rendered on each request and kept out of search engines' indexes, like the
// search page; robots.txt already disallows it (site/crawl.ts).
import config from "@payload-config";
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import { getPayload } from "payload";
import type { Locale } from "../cms/locales.ts";
import { fitPath, perLocale } from "./addresses.ts";
import { fill, getDictionary } from "./dictionary.ts";
import { checkFit, fitResponse } from "./fit.ts";
import { FitAnswerView } from "./fit-answer.tsx";
import { FitCheck } from "./fit-check.tsx";
import { fitCheckLabels } from "./fit-labels.ts";
import { SiteFrame } from "./frame.tsx";
import { getProductRoute } from "./product.tsx";

export async function FitPage({
  locale,
  part,
  query,
}: {
  locale: Locale;
  part: string;
  query: string;
}) {
  const dictionary = getDictionary(locale);
  const payload = await getPayload({ config });
  const db = (payload.db as unknown as PostgresAdapter).drizzle;
  const answer = await checkFit(db, part, query);
  // The product's name and address, from its cached lookup, once the
  // reference is known to be well formed and to exist.
  const route =
    answer.status === "checked" ? await getProductRoute(part) : null;

  return (
    <SiteFrame
      locale={locale}
      template="fit"
      paths={perLocale((other) => fitPath(other, part, query))}
    >
      <h1 className="text-3xl font-bold sm:text-4xl">{dictionary.fitTitle}</h1>
      {route && (
        <p className="mt-2 text-lg">
          {fill(dictionary.fitPart, { product: route.names[locale] })}
        </p>
      )}
      <div data-fit-result className="mt-6 text-lg">
        <FitAnswerView
          answer={fitResponse(answer, locale)}
          query={query}
          labels={dictionary}
        />
      </div>
      {route && (
        <>
          <p className="mt-6">
            <a href={route.paths[locale]}>{dictionary.fitBack}</a>
          </p>
          <div className="mt-10">
            <FitCheck
              locale={locale}
              part={part}
              action={fitPath(locale)}
              labels={fitCheckLabels(dictionary)}
            />
          </div>
        </>
      )}
    </SiteFrame>
  );
}
