// The product page's gallery (issue #200): on a phone the picture leads the
// page, under the name and above the price; from 48rem it keeps its column
// beside the text. The arrows go round, the thumbnails jump to their
// picture, and the current thumbnail follows the strip however it moved.
import { expect, type Page, test } from "@playwright/test";
import { MILLION_PRODUCT_ID } from "../catalog/generator.ts";
import { GALLERY_IMAGES } from "../site/images.ts";
import { productAddress } from "./addresses.ts";

const strip = (page: Page) => page.locator('main ul[data-list="gallery"]');
const thumbs = (page: Page) => page.locator("main .gallery-thumbs button");

/** The picture the strip shows, from its scroll position. */
const shown = (page: Page) =>
  strip(page).evaluate((list) =>
    Math.round(list.scrollLeft / list.clientWidth),
  );

/** Waits until the strip shows picture `index` and its thumbnail is marked. */
async function expectShown(page: Page, index: number) {
  await expect.poll(() => shown(page)).toBe(index);
  for (let i = 0; i < GALLERY_IMAGES; i++) {
    const thumb = thumbs(page).nth(i);
    if (i === index)
      await expect(thumb).toHaveAttribute("aria-current", "true");
    else await expect(thumb).not.toHaveAttribute("aria-current");
  }
}

test.describe("on Lighthouse's phone", () => {
  test.use({
    viewport: { width: 412, height: 823 },
    deviceScaleFactor: 1.75,
    hasTouch: true,
  });

  test("the name, then the picture at full width, then the price and the description", async ({
    page,
    request,
  }) => {
    await page.goto(await productAddress(request, "fr", MILLION_PRODUCT_ID));
    const main = page.getByRole("main");
    const box = async (selector: string) => {
      const found = await main.locator(selector).first().boundingBox();
      if (!found) throw new Error(`${selector} is not shown.`);
      return found;
    };
    const heading = await box("h1");
    const gallery = await box("[data-gallery]");
    const picture = await box('ul[data-list="gallery"] img');
    const price = await box("[data-price]");
    const description = await box("[data-computed-at].max-w-prose");
    expect(heading.y + heading.height).toBeLessThanOrEqual(gallery.y);
    expect(gallery.y + gallery.height).toBeLessThanOrEqual(price.y);
    expect(price.y).toBeLessThan(description.y);
    // The page's width less its 1rem margins, and square.
    expect(Math.round(picture.width)).toBe(412 - 32);
    expect(Math.round(picture.height)).toBe(Math.round(picture.width));
    // The first screen shows the whole picture.
    expect(picture.y + picture.height).toBeLessThan(823);
    // Nothing scrolls sideways.
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    ).toBe(0);
  });

  test("the first picture is fetched once, at 960 pixels, and nothing moves", async ({
    browser,
    request,
    baseURL,
  }) => {
    // No isMobile flag, as in e2e/intro.spec.ts (issue #132): with it,
    // Chromium's first, speculative choice of width uses a wider viewport.
    const context = await browser.newContext({
      viewport: { width: 412, height: 823 },
      deviceScaleFactor: 1.75,
      hasTouch: true,
      baseURL,
    });
    try {
      const page = await context.newPage();
      const requested: string[] = [];
      page.on("request", (sent) => {
        const { pathname } = new URL(sent.url());
        if (pathname.startsWith("/images/"))
          requested.push(pathname.split("/").pop() as string);
      });
      await page.goto(await productAddress(request, "fr", MILLION_PRODUCT_ID));
      const first = strip(page).locator("li").first().locator("img");
      await expect
        .poll(() =>
          first.evaluate(
            (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
          ),
        )
        .toBe(true);
      const file = await first.evaluate(
        (img: HTMLImageElement) => img.currentSrc.split("/").pop() as string,
      );
      expect(Number(/-(\d+)-[0-9a-f]+\.\w+$/.exec(file)?.[1]), file).toBe(960);
      // Its original is requested once at a large width: the 320 files are
      // its thumbnail's, and the related cards' of the same category.
      const original = file.replace(/\d+-[0-9a-f]+\.\w+$/, "");
      expect(
        requested.filter(
          (name) =>
            name.startsWith(original) && !name.startsWith(`${original}320-`),
        ),
      ).toEqual([file]);
      // No layout shift once the page and its scripts have run.
      await page.waitForLoadState("load");
      const shift = await page.evaluate(
        () =>
          new Promise<number>((resolve) => {
            new PerformanceObserver((list) =>
              resolve(
                list
                  .getEntries()
                  .reduce(
                    (sum, entry) =>
                      sum +
                      (entry as PerformanceEntry & { value: number }).value,
                    0,
                  ),
              ),
            ).observe({ type: "layout-shift", buffered: true });
            setTimeout(() => resolve(0), 500);
          }),
      );
      expect(shift).toBe(0);
    } finally {
      await context.close();
    }
  });
});

test("the arrows go round, the thumbnails jump, and the mark follows a swipe", async ({
  page,
  request,
}) => {
  await page.goto(await productAddress(request, "fr", MILLION_PRODUCT_ID));
  const gallery = page.getByRole("region", { name: "Photos du produit" });
  await expect(gallery).toBeVisible();
  await expect(strip(page).locator("li")).toHaveCount(GALLERY_IMAGES);
  await expect(thumbs(page)).toHaveCount(GALLERY_IMAGES);
  await expect(thumbs(page).nth(1)).toHaveAccessibleName(
    `Photo 2 sur ${GALLERY_IMAGES}`,
  );
  const next = gallery.getByRole("button", { name: "Photo suivante" });
  const previous = gallery.getByRole("button", { name: "Photo précédente" });
  await expectShown(page, 0);

  await next.click();
  await expectShown(page, 1);
  // From the last picture, "next" goes round to the first.
  await next.click();
  await expectShown(page, 0);
  // And "previous" from the first to the last.
  await previous.click();
  await expectShown(page, GALLERY_IMAGES - 1);

  // A thumbnail, from the keyboard.
  await thumbs(page).first().focus();
  await page.keyboard.press("Enter");
  await expectShown(page, 0);

  // A second press while the strip is still sliding counts from the first
  // press's target, so two presses go round to the first picture. Without
  // that, it would count from the half-way position and stop on the second.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // Settled on the first picture first.
  await expect
    .poll(() => strip(page).evaluate((list) => list.scrollLeft))
    .toBe(0);
  await strip(page).evaluate(
    (list) =>
      new Promise<void>((resolve, reject) => {
        const button = list
          .closest("[data-gallery]")
          ?.querySelector<HTMLButtonElement>('[data-direction="next"]');
        if (!button) return reject(new Error("No next arrow."));
        button.click();
        const tick = () => {
          if (list.scrollLeft === 0) return requestAnimationFrame(tick);
          if (list.scrollLeft >= list.clientWidth / 2)
            return reject(new Error(`Slid ${list.scrollLeft}px at once.`));
          button.click();
          resolve();
        };
        requestAnimationFrame(tick);
      }),
  );
  // It has left the first picture, and comes back to it.
  await expect
    .poll(() => strip(page).evaluate((list) => list.scrollLeft))
    .toBe(0);
  await expectShown(page, 0);

  // A swipe, or the keyboard on the strip, moves it without the controls.
  await strip(page).evaluate((list) =>
    list.scrollTo({ left: list.clientWidth, behavior: "instant" }),
  );
  await expectShown(page, 1);
});

test("from 48rem, the gallery keeps its column beside the text", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(await productAddress(request, "fr", MILLION_PRODUCT_ID));
  const gallery = await page.locator("main [data-gallery]").boundingBox();
  const heading = await page.locator("main h1").boundingBox();
  const price = await page.locator("main [data-price]").boundingBox();
  if (!gallery || !heading || !price) throw new Error("Parts not shown.");
  expect(Math.round(gallery.width)).toBe(28 * 16);
  expect(heading.x).toBeGreaterThan(gallery.x + gallery.width);
  expect(price.x).toBe(heading.x);
  expect(Math.abs(heading.y - gallery.y)).toBeLessThan(16);
});
