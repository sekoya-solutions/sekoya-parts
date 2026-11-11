import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";

// Cache Components, decided in docs/adr/0001-framework-and-rendering.md.
// partialPrefetching stays off (docs/adr/0008-caching-and-partial-refresh.md),
// so a first visit gets complete HTML; the Next.js docs ask for it to be set
// explicitly alongside cacheComponents.
const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: false,
};

// Payload inside the Next.js app (docs/adr/0006-content-management.md).
export default withPayload(nextConfig, { devBundleServerPackages: false });
