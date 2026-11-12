/**
 * The response header that names the commit a deployment was built from
 * (issue #67). The Lighthouse run on production reads it on the public
 * address before measuring, so it never scores an older deployment.
 */
export const COMMIT_HEADER = "x-sekoya-commit";

/**
 * The header rules for next.config.ts: every path gets the commit, or no rule
 * at all when the build has none (CI and local builds; Vercel sets
 * VERCEL_GIT_COMMIT_SHA during its builds).
 */
export function commitHeaders(commit: string | undefined) {
  return commit
    ? [{ source: "/:path*", headers: [{ key: COMMIT_HEADER, value: commit }] }]
    : [];
}
