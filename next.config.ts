import type { NextConfig } from "next";

// Cache Components and Partial Prefetching, decided in docs/adr/0001-framework-and-rendering.md.
// The Next.js docs ask for partialPrefetching to be set explicitly with cacheComponents.
const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
