// Resizes the catalog's images at build time (issue #85,
// docs/adr/0012-front-end-assets.md): every original in assets/images, at
// each width of site/images.ts, in AVIF, WebP and JPEG, into public/images,
// which the site serves as static files. scripts/build.js runs it before
// every build: locally, in CI and on Vercel.
//
// The originals are checked against assets/images/manifest.json first, so a
// missing, extra or changed original fails the build instead of shipping a
// page whose image is absent. After replacing an original on purpose, run
// `npm run images -- --update-manifest`.
//
// Outputs are kept in .next/cache/sekoya-images, which Vercel keeps between
// builds: an output whose name (original and settings hashed) is already
// there is copied rather than encoded again.
//
// Usage: node scripts/images.ts [--update-manifest]
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import {
  allImages,
  IMAGE_FORMATS,
  IMAGE_SIZE,
  IMAGE_WIDTHS,
  IMAGES_PER_CATEGORY,
  type ImageKey,
  ORIGINALS_DIR,
  OUTPUT_DIR,
  originalHash,
  outputName,
} from "../site/images.ts";

const CACHE_DIR = ".next/cache/sekoya-images";
const MANIFEST = join(ORIGINALS_DIR, "manifest.json");

const hashFile = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex").slice(0, 16);

const originalPath = ({ folder, n }: ImageKey) =>
  join(ORIGINALS_DIR, folder, `${n}.jpg`);

/** The originals on disk, by folder, as the manifest records them. */
function scanOriginals(): Record<string, string[]> {
  const found: Record<string, string[]> = {};
  for (const folder of readdirSync(ORIGINALS_DIR).sort()) {
    if (!statSync(join(ORIGINALS_DIR, folder)).isDirectory()) continue;
    const files = readdirSync(join(ORIGINALS_DIR, folder)).sort();
    const expected = Array.from(
      { length: IMAGES_PER_CATEGORY },
      (_, i) => `${i + 1}.jpg`,
    );
    if (files.join() !== expected.join())
      throw new Error(
        `${ORIGINALS_DIR}/${folder} must hold exactly ${expected.join(", ")}; it holds ${files.join(", ") || "nothing"}.`,
      );
    found[folder] = expected.map((file) =>
      hashFile(join(ORIGINALS_DIR, folder, file)),
    );
  }
  return found;
}

const found = scanOriginals();
if (process.argv.includes("--update-manifest")) {
  writeFileSync(MANIFEST, `${JSON.stringify(found, null, 2)}\n`);
  console.log(`Wrote ${MANIFEST}. Rebuild to use it.`);
  process.exit(0);
}
const recorded = JSON.parse(readFileSync(MANIFEST, "utf8"));
if (JSON.stringify(found) !== JSON.stringify(recorded)) {
  console.error(
    `The originals in ${ORIGINALS_DIR} differ from ${MANIFEST}. If the change is intended, run: npm run images -- --update-manifest`,
  );
  process.exit(1);
}

const start = performance.now();
rmSync(OUTPUT_DIR, { recursive: true, force: true });
mkdirSync(OUTPUT_DIR, { recursive: true });
mkdirSync(CACHE_DIR, { recursive: true });

let encoded = 0;
let reused = 0;
let bytes = 0;
for (const key of allImages()) {
  // Re-checked here as well, so an output is never named after a stale hash.
  if (hashFile(originalPath(key)) !== originalHash(key))
    throw new Error(`${originalPath(key)} does not match its manifest hash.`);
  const original = readFileSync(originalPath(key));
  const { width, height } = await sharp(original).metadata();
  if (width !== IMAGE_SIZE || height !== IMAGE_SIZE)
    throw new Error(
      `${originalPath(key)} is ${width} x ${height}; it must be ${IMAGE_SIZE} x ${IMAGE_SIZE}.`,
    );
  await Promise.all(
    IMAGE_FORMATS.flatMap(({ ext, options }) =>
      IMAGE_WIDTHS.map(async (w) => {
        const name = outputName(key, w, ext);
        const cached = join(CACHE_DIR, name);
        if (existsSync(cached)) {
          reused++;
        } else {
          await sharp(original)
            .resize(w, w)
            .toFormat(ext === "jpg" ? "jpeg" : ext, options)
            .toFile(cached);
          encoded++;
        }
        copyFileSync(cached, join(OUTPUT_DIR, name));
        bytes += statSync(cached).size;
      }),
    ),
  );
}

const seconds = ((performance.now() - start) / 1000).toFixed(1);
console.log(
  `Images: ${encoded + reused} files in ${OUTPUT_DIR} (${encoded} encoded, ${reused} reused from the cache), ${(bytes / 1_000_000).toFixed(1)} MB, in ${seconds} s.`,
);
