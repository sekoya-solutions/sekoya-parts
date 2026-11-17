// The home page's promotions (issue #155): three slides and three tiles, as
// the seed migration loads them, with no browser code. Their texts are read
// from the page, never written here.
import { expect, test } from "@playwright/test";
import { locales } from "../cms/locales.ts";
import { brandIndexPath } from "../site/addresses.ts";

test.use({ javaScriptEnabled: false });

for (const locale of locales)
  test(`the ${locale} home page shows three slides and three tiles, each leading to a page that answers 200`, async ({
    page,
    request,
  }) => {
    await page.goto(`/${locale}`);
    const slides = page.locator(".slider > li");
    const tiles = page.locator('[data-list="tiles"] > li');
    await expect(slides).toHaveCount(3);
    await expect(tiles).toHaveCount(3);
    const links = await page
      .locator(".slider > li > a, [data-list='tiles'] > li > a")
      .evaluateAll((anchors) =>
        anchors.map((a) => ({
          href: a.getAttribute("href") as string,
          headline: a.querySelector("strong")?.textContent ?? "",
        })),
      );
    for (const { href, headline } of links) {
      expect(headline.trim(), href).not.toBe("");
      expect(href.startsWith(`/${locale}/`), href).toBe(true);
      const response = await request.get(href, { maxRedirects: 0 });
      expect(response.status(), href).toBe(200);
    }
  });

// The part finder is on the home page itself (issue #196): the first slide,
// which led to its former page, leads to the brand index, as a promotion of
// a category the catalog no longer has would.
for (const locale of locales)
  test(`the ${locale} first slide leads to the brand index`, async ({
    page,
  }) => {
    await page.goto(`/${locale}`);
    await expect(page.locator(".slider > li > a").first()).toHaveAttribute(
      "href",
      brandIndexPath(locale),
    );
  });

test("the slides' headlines are in the page's language", async ({ page }) => {
  const headline = async (locale: string) => {
    await page.goto(`/${locale}`);
    return page.locator(".slider > li strong").first().textContent();
  };
  expect(await headline("fr")).not.toBe(await headline("de"));
});

test("the slider moves by its numbered links and never by itself", async ({
  page,
}) => {
  await page.goto("/fr");
  const nav = page.locator(".slider-nav a");
  await expect(nav).toHaveCount(3);
  for (const [index, href] of (
    await nav.evaluateAll((anchors) =>
      anchors.map((a) => a.getAttribute("href") as string),
    )
  ).entries()) {
    expect(href).toBe(`#slide-${index + 1}`);
    await expect(page.locator(href)).toHaveCount(1);
  }
  // No script moves it: there is none, and nothing autoplays.
  await expect(page.locator(".slider")).not.toHaveAttribute(
    "data-autoplay",
    /.*/,
  );
});

test("the promotion images are described as decorative, sized, and lazy but for the first slide's", async ({
  page,
}) => {
  await page.goto("/fr");
  const images = await page
    .locator("[data-promotions] picture > img")
    .evaluateAll((imgs) =>
      imgs.map((img) => ({
        alt: img.getAttribute("alt"),
        width: img.getAttribute("width"),
        height: img.getAttribute("height"),
        loading: img.getAttribute("loading"),
        priority: img.getAttribute("fetchpriority"),
        src: img.getAttribute("src") as string,
      })),
    );
  expect(images).toHaveLength(6);
  // The headline and text beside each image say what it leads to.
  for (const image of images) expect(image.alt).toBe("");
  // The first slide's image is the home page's largest element on a phone
  // (issue #196), fetched first; the others wait until they are near.
  expect(images.map((i) => [i.loading, i.priority])).toEqual([
    ["eager", "high"],
    ...images.slice(1).map(() => ["lazy", null]),
  ]);
  const slides = images.filter((i) => i.src.includes("promotion-slides"));
  expect(slides.map((i) => [i.width, i.height])).toEqual([
    ["2400", "900"],
    ["2400", "900"],
    ["2400", "900"],
  ]);
});
