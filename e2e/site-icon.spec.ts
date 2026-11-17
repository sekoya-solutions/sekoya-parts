// The site's icon (issue #211). A page that declares no icon makes Chrome ask
// for /favicon.ico by itself, and that address fell into app/(site)/[lang]:
// its 404 was logged to the console and cost Lighthouse's best practices
// score 4 points on every page. Playwright's headless shell never fetches
// icons, so the test reads what a browser would: the icons each page
// declares, and /favicon.ico itself.
import { expect, test } from "@playwright/test";
import { productAddress } from "./addresses.ts";

test("/favicon.ico answers with an icon", async ({ request }) => {
  const response = await request.get("/favicon.ico");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/x-icon");
  // An ICO file's header: reserved 0, then type 1, an icon.
  expect([...(await response.body()).subarray(0, 4)]).toEqual([0, 0, 1, 0]);
});

test("the measured pages declare the site's icons, and each answers", async ({
  page,
  request,
}) => {
  const product = await productAddress(request, "fr", 1);
  for (const address of ["/fr", "/fr/ampoule", product]) {
    await page.goto(address);
    const icons = await page
      .locator('head link[rel="icon"]')
      .evaluateAll((links) =>
        links.map((link) => ({
          href: (link as HTMLLinkElement).href,
          type: link.getAttribute("type"),
        })),
      );
    expect(
      icons.map(({ type }) => type).sort(),
      `${address} declares its icons`,
    ).toEqual(["image/svg+xml", "image/x-icon"]);
    for (const { href, type } of icons) {
      const response = await request.get(href);
      expect(response.status(), href).toBe(200);
      expect(response.headers()["content-type"], href).toBe(type);
    }
  }
});
