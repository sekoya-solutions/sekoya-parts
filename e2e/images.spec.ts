// The catalog's images (issue #85, docs/specs/design-system.md): each kind of
// page shows its images with a text alternative, width and height, the
// product page's main image loads first, and every address a page references
// answers with its format and a year of caching.
import { expect, type Page, test } from "@playwright/test";
import { MILLION_PRODUCT_ID } from "../catalog/generator.ts";
import { IMAGE_FORMATS, IMAGE_WIDTHS } from "../site/images.ts";
import { IMAGE_CACHE_CONTROL } from "../site/images-headers.ts";
import { EAGER_IMAGES } from "../site/picture.tsx";
import { productAddress } from "./addresses.ts";

/** Every image of the main content, with what the tests check. */
const mainImages = (page: Page) =>
  page
    .getByRole("main")
    .locator("picture > img")
    .evaluateAll((imgs) =>
      imgs.map((img) => ({
        alt: img.getAttribute("alt"),
        width: img.getAttribute("width"),
        height: img.getAttribute("height"),
        loading: img.getAttribute("loading"),
        priority: img.getAttribute("fetchpriority"),
        sources: img.parentElement?.querySelectorAll("source").length,
      })),
    );

/** Every image has a text alternative, its size, and AVIF and WebP sources. */
function expectDescribed(images: Awaited<ReturnType<typeof mainImages>>) {
  for (const image of images) {
    expect(image.alt?.trim()).toBeTruthy();
    expect(image.width).toBe("1600");
    expect(image.height).toBe("1600");
    expect(image.sources).toBe(IMAGE_FORMATS.length - 1);
  }
}

test("the home page shows an image per category, the first ones loaded at once", async ({
  page,
}) => {
  await page.goto("/fr");
  const images = await mainImages(page);
  expect(images).toHaveLength(12);
  expectDescribed(images);
  expect(images.map((i) => i.loading)).toEqual(
    images.map((_, i) => (i < EAGER_IMAGES ? "eager" : "lazy")),
  );
});

test("a category page shows each product's image, described by its name", async ({
  page,
}) => {
  await page.goto("/fr");
  await page.getByRole("main").locator("li a").first().click();
  const images = await mainImages(page);
  expect(images).toHaveLength(48);
  expectDescribed(images);
  const names = await page
    .getByRole("main")
    .locator("ul > li > a")
    .allTextContents();
  expect(images.map((i) => i.alt)).toEqual(names);
});

test("the product page's main image loads first, described by the product's name", async ({
  page,
  request,
}) => {
  await page.goto(await productAddress(request, "de", MILLION_PRODUCT_ID));
  const images = await mainImages(page);
  expect(images).toHaveLength(1);
  expectDescribed(images);
  expect(images[0]?.loading).toBe("eager");
  expect(images[0]?.priority).toBe("high");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    images[0]?.alt as string,
  );
  // The image is drawn, not only referenced.
  const drawn = await page
    .getByRole("main")
    .locator("picture > img")
    .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
  expect(drawn).toBe(true);
});

test("a model page shows its products' images", async ({ page, request }) => {
  await page.goto(await productAddress(request, "fr", MILLION_PRODUCT_ID));
  const model = page.getByRole("main").locator(".reference-list a").first();
  await page.goto((await model.getAttribute("href")) as string);
  const images = await mainImages(page);
  expect(images.length).toBeGreaterThan(0);
  expectDescribed(images);
});

test("every image address on a category page answers with its format and a year of caching", async ({
  request,
}) => {
  const home = await (await request.get("/fr")).text();
  const category = home.match(/<a href="(\/fr\/[a-z-]+)"/)?.[1] as string;
  const html = await (await request.get(category)).text();
  const urls = [
    ...new Set(html.match(/\/images\/[a-z0-9-]+\.(avif|webp|jpg)/g)),
  ];
  // Four images per category, each in every format and width.
  expect(urls).toHaveLength(4 * IMAGE_FORMATS.length * IMAGE_WIDTHS.length);
  for (const url of urls) {
    const response = await request.get(url);
    expect(response.status(), url).toBe(200);
    const ext = url.split(".").at(-1);
    expect(response.headers()["content-type"]).toBe(
      IMAGE_FORMATS.find((f) => f.ext === ext)?.type,
    );
    expect(response.headers()["cache-control"]).toBe(IMAGE_CACHE_CONTROL);
  }
});
