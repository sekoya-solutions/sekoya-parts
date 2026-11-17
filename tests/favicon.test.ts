// The site's icon (issue #211): the committed app/favicon.ico holds the
// 16, 32 and 48 px images of app/icon.svg, so it cannot drift from the SVG.
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  FAVICON,
  FAVICON_SIZES,
  ICON_SVG,
  icoFile,
  icoImages,
  renderIcon,
} from "../scripts/favicon.ts";

const pixels = async (png: Buffer) => {
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
};

describe("favicon.ico", () => {
  it("round-trips its images through the ICO format", () => {
    const images = [
      { size: 16, png: Buffer.from("sixteen") },
      { size: 256, png: Buffer.from("two hundred and fifty-six") },
    ];
    expect(icoImages(icoFile(images))).toEqual(images);
  });

  it("holds the SVG's image at each size", async () => {
    const svg = readFileSync(ICON_SVG);
    const images = icoImages(readFileSync(FAVICON));
    expect(images.map(({ size }) => size)).toEqual([...FAVICON_SIZES]);
    for (const { size, png } of images) {
      const committed = await pixels(png);
      const fresh = await pixels(await renderIcon(svg, size));
      expect([committed.width, committed.height]).toEqual([size, size]);
      expect([fresh.width, fresh.height]).toEqual([size, size]);
      // A rasterizer of another platform may round an edge pixel differently.
      let worst = 0;
      for (let i = 0; i < fresh.data.length; i++)
        worst = Math.max(
          worst,
          Math.abs((committed.data[i] ?? 0) - (fresh.data[i] ?? 0)),
        );
      expect(worst, `${size} px differs from app/icon.svg`).toBeLessThan(16);
    }
  });
});
