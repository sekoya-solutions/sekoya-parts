// The site's icon (issue #211): app/icon.svg is the source, the leaf-green o
// of the wordmark on navy (owner decision, issue #211). Next.js declares it in
// every page's <head>. This script builds app/favicon.ico from it, for
// clients that ask for /favicon.ico without reading the page: one PNG image
// per size, which every current browser reads inside an ICO file.
// tests/favicon.test.ts fails when the committed favicon.ico no longer
// matches the SVG, so run this script after changing the SVG.
//
// Usage: node scripts/favicon.ts
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

export const ICON_SVG = "app/icon.svg";
export const FAVICON = "app/favicon.ico";
export const FAVICON_SIZES = [16, 32, 48] as const;

/** The SVG rendered as a PNG of `size` pixels square. */
export function renderIcon(svg: Buffer, size: number): Promise<Buffer> {
  return sharp(svg, { density: (72 * size) / 32 })
    .resize(size, size)
    .png()
    .toBuffer();
}

/** An ICO file holding these PNG images, of the sizes given. */
export function icoFile(images: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(size % 256, entry); // width, 0 meaning 256
    header.writeUInt8(size % 256, entry + 1); // height
    header.writeUInt8(0, entry + 2); // no palette
    header.writeUInt8(0, entry + 3); // reserved
    header.writeUInt16LE(1, entry + 4); // colour planes
    header.writeUInt16LE(32, entry + 6); // bits per pixel
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map(({ png }) => png)]);
}

/** The images an ICO file holds: their declared size and PNG bytes. */
export function icoImages(ico: Buffer): { size: number; png: Buffer }[] {
  if (ico.readUInt16LE(0) !== 0 || ico.readUInt16LE(2) !== 1)
    throw new Error("not an ICO file");
  return Array.from({ length: ico.readUInt16LE(4) }, (_, i) => {
    const entry = 6 + 16 * i;
    const length = ico.readUInt32LE(entry + 8);
    const offset = ico.readUInt32LE(entry + 12);
    return {
      size: ico.readUInt8(entry) || 256,
      png: ico.subarray(offset, offset + length),
    };
  });
}

if (import.meta.main) {
  const svg = readFileSync(ICON_SVG);
  const images = await Promise.all(
    FAVICON_SIZES.map(async (size) => ({
      size,
      png: await renderIcon(svg, size),
    })),
  );
  writeFileSync(FAVICON, icoFile(images));
  console.log(`${FAVICON}: ${FAVICON_SIZES.join(", ")} px`);
}
