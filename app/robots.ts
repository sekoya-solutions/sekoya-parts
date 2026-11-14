// robots.txt (docs/adr/0011-languages-and-seo.md, issue #121): everything is
// disallowed but the crawl showcase, the assets its pages load and the
// sitemap. Rendered on each request from the shared cache entries, so it
// follows their refreshes; site/crawl.ts holds the rules.
import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { robotsRules, SITEMAP_PATH } from "../site/crawl.ts";
import { getCrawlPaths } from "../site/crawl-data.ts";
import { siteUrl } from "../site/site-url.ts";

export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection();
  return {
    rules: { userAgent: "*", ...robotsRules(await getCrawlPaths()) },
    sitemap: new URL(SITEMAP_PATH, siteUrl(process.env)).href,
  };
}
