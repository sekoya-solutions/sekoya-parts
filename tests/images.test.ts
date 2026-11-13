// The catalog's images (issue #85): the manifest matches the originals on
// disk, every generated category has its four images, each product always
// gets the same one of them, and output addresses change with their original.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "../assets/images/manifest.json" with { type: "json" };
import { categories } from "../catalog/generator.ts";
import {
  allImages,
  categoryFolder,
  categoryImage,
  IMAGE_WIDTHS,
  IMAGES_PER_CATEGORY,
  imagePath,
  ORIGINALS_DIR,
  outputName,
  productImage,
  srcSet,
} from "../site/images.ts";

const sha = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex").slice(0, 16);

describe("the originals", () => {
  it("match the manifest, four per folder", () => {
    const folders = readdirSync(ORIGINALS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(folders).toEqual(Object.keys(manifest).sort());
    for (const folder of folders) {
      expect(readdirSync(join(ORIGINALS_DIR, folder)).sort()).toEqual([
        "1.jpg",
        "2.jpg",
        "3.jpg",
        "4.jpg",
      ]);
      const hashes = (manifest as Record<string, string[]>)[folder];
      for (let n = 1; n <= IMAGES_PER_CATEGORY; n++)
        expect(sha(join(ORIGINALS_DIR, folder, `${n}.jpg`))).toBe(
          hashes?.[n - 1],
        );
    }
    expect(allImages()).toHaveLength(48);
  });

  it("cover each of the generator's twelve categories", () => {
    for (const category of categories())
      expect(categoryFolder(category.id), category.names.en).not.toBeNull();
  });
});

describe("productImage", () => {
  it("gives a product one of its category's images, always the same", () => {
    expect(productImage(1, 1)).toEqual({ folder: "belt", n: 1 });
    expect(productImage(1, 2)).toEqual({ folder: "belt", n: 2 });
    expect(productImage(1, 4)).toEqual({ folder: "belt", n: 4 });
    expect(productImage(1, 5)).toEqual({ folder: "belt", n: 1 });
    expect(productImage(11, 100_000)).toEqual(productImage(11, 100_000));
  });

  it("spreads a category's products evenly over its four images", () => {
    const counts = [0, 0, 0, 0];
    for (let id = 1; id <= 1000; id++) {
      const n = productImage(7, id)?.n as number;
      counts[n - 1] = (counts[n - 1] ?? 0) + 1;
    }
    expect(counts).toEqual([250, 250, 250, 250]);
  });

  it("gives nothing for a category without images", () => {
    expect(productImage(999, 1)).toBeNull();
    expect(categoryImage(999)).toBeNull();
  });

  it("gives a category its first image", () => {
    expect(categoryImage(11)).toEqual({ folder: "lamp", n: 1 });
  });
});

describe("output addresses", () => {
  const key = { folder: "belt", n: 2 };

  it("carry the image, the width and a hash, in each format", () => {
    expect(outputName(key, 640, "avif")).toMatch(
      /^belt-2-640-[0-9a-f]{8}\.avif$/,
    );
    expect(imagePath(key, 320, "jpg")).toMatch(
      /^\/images\/belt-2-320-[0-9a-f]{8}\.jpg$/,
    );
  });

  it("differ between formats and between originals", () => {
    const hash = (name: string) => name.split("-").at(-1)?.split(".")[0];
    expect(hash(outputName(key, 640, "avif"))).not.toBe(
      hash(outputName(key, 640, "webp")),
    );
    expect(hash(outputName(key, 640, "avif"))).not.toBe(
      hash(outputName({ folder: "belt", n: 3 }, 640, "avif")),
    );
  });

  it("list every width in a srcset", () => {
    expect(srcSet(key, "webp").split(", ")).toHaveLength(IMAGE_WIDTHS.length);
    for (const width of IMAGE_WIDTHS)
      expect(srcSet(key, "webp")).toContain(` ${width}w`);
  });

  it("refuse an image the manifest does not hold", () => {
    expect(() => outputName({ folder: "belt", n: 5 }, 640, "jpg")).toThrow(
      /manifest/,
    );
  });
});
