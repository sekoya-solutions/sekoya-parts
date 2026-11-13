import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";
import { commitHeaders } from "./site/commit.ts";
import { imageHeaders } from "./site/images-headers.ts";

// Cache Components, decided in docs/adr/0001-framework-and-rendering.md.
// partialPrefetching stays off (docs/adr/0008-caching-and-partial-refresh.md),
// so a first visit gets complete HTML; the Next.js docs ask for it to be set
// explicitly alongside cacheComponents.
const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: false,
  // The deployment's commit on every response (issue #67), and a year of
  // caching for the catalog's images, whose names change with their content
  // (issue #85).
  async headers() {
    return [
      ...commitHeaders(process.env.VERCEL_GIT_COMMIT_SHA),
      ...imageHeaders(),
    ];
  },
};

// Payload inside the Next.js app (docs/adr/0006-content-management.md); it
// adds its own headers after these.
export default withPayload(nextConfig, { devBundleServerPackages: false });
