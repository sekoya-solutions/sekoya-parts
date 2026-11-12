// The site's own origin, for metadataBase: language tags must give full
// addresses (docs/adr/0011-languages-and-seo.md). On Vercel, from the system
// environment variables; elsewhere (CI and local builds), localhost.

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Production uses the project's production domain, so every deployment of
 * main names the public address. A preview uses its branch address when
 * Vercel gives one, else the deployment's own.
 */
export function siteUrl(env: Env): URL {
  const host =
    env.VERCEL_ENV === "production"
      ? env.VERCEL_PROJECT_PRODUCTION_URL
      : env.VERCEL_ENV
        ? env.VERCEL_BRANCH_URL || env.VERCEL_URL
        : undefined;
  if (host) return new URL(`https://${host}`);
  return new URL(`http://localhost:${env.PORT || 3000}`);
}
