// The first screen of the image-led pages (issue #87): on the phone Lighthouse
// emulates, the largest element is the introduction, which paints with the
// HTML, rather than a card image, which waits for its download. And each card
// image is fetched at the width it is shown at, not wider.
import { expect, type Page, test } from "@playwright/test";
import { locales } from "../cms/locales.ts";

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

/** The width in each card image's chosen file name, such as 320. */
const cardWidths = (page: Page) =>
  page
    .getByRole("main")
    .locator("picture > img")
    .evaluateAll((imgs) =>
      (imgs as HTMLImageElement[])
        .filter((img) => img.complete && img.currentSrc)
        .map((img) =>
          Number(/-(\d+)-[0-9a-f]+\.\w+$/.exec(img.currentSrc)?.[1]),
        ),
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
}

test("card images are fetched at 320 pixels on Lighthouse's phone", async ({
  page,
}) => {
  await page.goto("/fr");
  const category = (await page
    .getByRole("main")
    .locator("li a")
    .first()
    .getAttribute("href")) as string;
  for (const path of ["/fr", category]) {
    await page.goto(path);
    await largestElement(page);
    const widths = await cardWidths(page);
    expect(widths.length, path).toBeGreaterThan(0);
    // 158 CSS pixels at 1.75x need 277: the 320 file, not the 480 one.
    for (const width of widths) expect(width, path).toBe(320);
  }
});
