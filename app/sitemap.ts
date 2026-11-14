// The showcase sitemap (docs/adr/0011-languages-and-seo.md, issue #121): the
// same addresses robots.txt allows, at full addresses. Language tags stay in
// each page's head and are not repeated here. Rendered on each request from
// the shared cache entries, so it follows their refreshes.
import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { getCrawlPaths } from "../site/crawl-data.ts";
import { siteUrl } from "../site/site-url.ts";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const origin = siteUrl(process.env);
  return (await getCrawlPaths()).map((path) => ({
    url: new URL(path, origin).href,
  }));
}
