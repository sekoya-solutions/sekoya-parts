// The cache header of the catalog's images (issue #85): a year, immutable.
// Each file's name carries a hash of its original and its encoding settings
// (site/images.ts), so a changed image always gets a new address.
export const IMAGE_CACHE_CONTROL = "public, max-age=31536000, immutable";

/** The header rule for next.config.ts. */
export const imageHeaders = () => [
  {
    source: "/images/:path*",
    headers: [{ key: "Cache-Control", value: IMAGE_CACHE_CONTROL }],
  },
];
