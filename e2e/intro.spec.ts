// The first screen of the image-led pages (issue #87): on the phone Lighthouse
// emulates, the largest element is the introduction, which paints with the
// HTML, rather than a card image, which waits for its download. And each card
// image is fetched at the width it is shown at, not wider.
import { expect, type Page, test } from "@playwright/test";
import { MILLION_PRODUCT_ID } from "../catalog/generator.ts";
import { locales } from "../cms/locales.ts";
import { MODEL_WORDS } from "../site/addresses.ts";
import { productAddress } from "./addresses.ts";

// Lighthouse's mobile emulation: 412 x 823 CSS pixels at 1.75x.
test.use({
  viewport: { width: 412, height: 823 },
  deviceScaleFactor: 1.75,
  isMobile: true,
  hasTouch: true,
});

/**
 * The element of the page's last largest-contentful-paint entry, once every
 * image of the first screen has loaded, so no later, larger candidate is left.
 */
async function largestElement(page: Page) {
  await page.waitForLoadState("load");
  await page.waitForFunction(() =>
    [...document.images]
      .filter((img) => img.getBoundingClientRect().top < window.innerHeight)
      .every((img) => img.complete),
  );
  return page.evaluate(
    () =>
      new Promise<{ intro: boolean; tag: string }>((resolve) => {
        new PerformanceObserver((list) => {
          const last = list.getEntries().at(-1) as
            | (PerformanceEntry & { element: Element | null })
            | undefined;
          resolve({
            intro: last?.element?.hasAttribute("data-intro") ?? false,
            tag: last?.element?.outerHTML.slice(0, 120) ?? "none",
          });
        }).observe({ type: "largest-contentful-paint", buffered: true });
      }),
  );
}

/**
 * The width in each loaded card image's chosen file name, such as 320, with
 * what the browser based its choice on, for the failure message.
 */
const cardWidths = (page: Page) =>
  page
    .getByRole("main")
    .locator("picture > img")
    .evaluateAll((imgs) =>
      (imgs as HTMLImageElement[])
        .filter((img) => img.complete && img.currentSrc)
        .map((img) => ({
          width: Number(/-(\d+)-[0-9a-f]+\.\w+$/.exec(img.currentSrc)?.[1]),
          detail: `${img.currentSrc.split("/").pop()} shown ${img.clientWidth}px, window ${window.innerWidth}px, document ${document.documentElement.clientWidth}px, ${window.devicePixelRatio}x`,
        })),
    );

for (const locale of locales) {
  test(`the ${locale} home page's largest element is its introduction`, async ({
    page,
  }) => {
    await page.goto(`/${locale}`);
    await expect(page.locator("[data-intro]")).toHaveCount(1);
    const largest = await largestElement(page);
    expect(largest.intro, largest.tag).toBe(true);
  });

  test(`the ${locale} first category page's largest element is its introduction`, async ({
    page,
  }) => {
    await page.goto(`/${locale}`);
    const category = (await page
      .getByRole("main")
      .locator("li a")
      .first()
      .getAttribute("href")) as string;
    await page.goto(category);
    await expect(page.locator("[data-intro]")).toHaveCount(1);
    const largest = await largestElement(page);
    expect(largest.intro, largest.tag).toBe(true);
  });

  // The model Lighthouse measures: the first one product 1's page links to.
  test(`the ${locale} model page's largest element is its introduction`, async ({
    page,
    request,
  }) => {
    await page.goto(await productAddress(request, locale, MILLION_PRODUCT_ID));
    const model = (await page
      .getByRole("main")
      .locator(`a[href^="/${locale}/${MODEL_WORDS[locale]}/"]`)
      .first()
      .getAttribute("href")) as string;
    await page.goto(model);
    await expect(page.locator("[data-intro]")).toHaveCount(1);
    const largest = await largestElement(page);
    expect(largest.intro, largest.tag).toBe(true);
  });
}

// Each page is measured on a first visit, in a browser context of its own, as
// Lighthouse measures it: a context that has already shown the page may reuse
// an image it holds at another width.
//
// The context first loads a light page of the same site (issue #132). A new
// context's first page loads in a fresh renderer process, which chose its
// first images before Playwright's phone emulation reached it: on CI run
// 43598464941, both pages requested their first two card images at 480, then
// again at 320 once the emulation applied, and /fr/ampoule kept the 480 file.
// Lighthouse's own runs request 320 only. A second page of the same site loads
// in the same process, whose emulation is in place. Every image request is
// checked, not only the file shown, so a stray request fails the test.
test("card images are fetched at 320 pixels on Lighthouse's phone", async ({
  browser,
  request,
  viewport,
  deviceScaleFactor,
  isMobile,
  hasTouch,
  baseURL,
}) => {
  const home = await (await request.get("/fr")).text();
  // The home page's first links under /fr/ are its category tiles; the
  // showcase products' links come after them (issue #111).
  const category = /href="(\/fr\/[a-z0-9-]+)"/.exec(home)?.[1];
  if (!category) throw new Error("No category link on /fr.");
  for (const path of ["/fr", category]) {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor,
      isMobile,
      hasTouch,
      baseURL,
    });
    try {
      const page = await context.newPage();
      await page.goto("/robots.txt");
      const requested: string[] = [];
      page.on("request", (request) => {
        const { pathname } = new URL(request.url());
        if (pathname.startsWith("/images/"))
          requested.push(pathname.split("/").pop() as string);
      });
      await page.goto(path);
      await largestElement(page);
      const widths = await cardWidths(page);
      expect(widths.length, path).toBeGreaterThan(0);
      // 158 CSS pixels at 1.75x need 277: the 320 file, not the 480 one.
      for (const { width, detail } of widths)
        expect(width, `${path}: ${detail}`).toBe(320);
      expect(requested.length, path).toBeGreaterThan(0);
      for (const file of requested)
        expect(
          Number(/-(\d+)-[0-9a-f]+\.\w+$/.exec(file)?.[1]),
          `${path}: requested ${file}`,
        ).toBe(320);
    } finally {
      await context.close();
    }
  }
});
