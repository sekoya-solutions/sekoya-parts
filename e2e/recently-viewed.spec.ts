// "Recently viewed" on the product page (issue #162): the history kept in the
// browser's local storage only, shown newest first in a space of fixed
// height, cleared by its button, checked on every read, and absent without
// JavaScript or storage. The products opened come from the page's related
// list, read by its marker (AGENTS.md, section 3).
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { MILLION_PRODUCT_ID, productReference } from "../catalog/generator.ts";
import { HISTORY_KEY } from "../site/history.ts";
import { productAddress } from "./addresses.ts";

// The million-model product, which Lighthouse measures too: it shares models
// with every product, so its related list is full on any catalog.
const PRODUCT = MILLION_PRODUCT_ID;

const RELATED = 'main ul[data-list="related"] > li > a';
const SPACE = "[data-recently-viewed]";
const SHOWN =
  '[data-recently-viewed="list"] ul[data-list="recently-viewed"] > li > a';

/** A page's address and its heading, as the history stores them. */
async function opened(page: Page, address: string) {
  const response = await page.goto(address);
  expect(response?.status()).toBe(200);
  await expect(page.locator('main[data-template="product"]')).toHaveCount(1);
  return {
    path: new URL(page.url()).pathname,
    name: (await page.getByRole("heading", { level: 1 }).textContent()) ?? "",
  };
}

/** Opens the product, then the first `count` products of its related list. */
async function browse(page: Page, address: string, count: number) {
  await page.goto(address);
  const links = await page
    .locator(RELATED)
    .evaluateAll((anchors) => anchors.map((a) => a.getAttribute("href") ?? ""));
  expect(links.length).toBeGreaterThanOrEqual(count);
  const products = [];
  for (const link of links.slice(0, count)) {
    products.push(await opened(page, link));
    // The page's script has stored it before the next one opens.
    await expect
      .poll(() =>
        page.evaluate(
          (key) => JSON.parse(localStorage.getItem(key) ?? "[]").length,
          HISTORY_KEY,
        ),
      )
      .toBe(products.length + 1);
  }
  return products;
}

/** The footer's distance from the top of the page, which a shift would change. */
const footerTop = (page: Page) =>
  page
    .getByRole("contentinfo")
    .evaluate((footer) => footer.getBoundingClientRect().top + window.scrollY);

test.describe("with JavaScript", () => {
  test("shows the other products viewed, newest first, without shifting the page", async ({
    page,
    browser,
    request,
  }) => {
    const address = await productAddress(request, "fr", PRODUCT);

    // A first visit: the space is there, empty.
    await opened(page, address);
    await expect(page.locator(SPACE)).toHaveAttribute(
      "data-recently-viewed",
      "empty",
    );
    const emptyTop = await footerTop(page);
    const emptyHeight = await page
      .locator(SPACE)
      .evaluate((space) => space.getBoundingClientRect().height);

    const products = await browse(page, address, 3);
    await opened(page, address);
    const shown = page.locator(SHOWN);
    await expect(shown).toHaveCount(3);
    const expected = [...products].reverse();
    expect(
      await shown.evaluateAll((anchors) =>
        anchors.map((a) => ({
          path: a.getAttribute("href"),
          name: a.textContent,
        })),
      ),
    ).toEqual(expected);
    await expect(
      page.getByRole("heading", { level: 2, name: "Vus récemment" }),
    ).toHaveCount(1);
    // The same space, so nothing below it moved.
    expect(
      await page
        .locator(SPACE)
        .evaluate((space) => space.getBoundingClientRect().height),
    ).toBe(emptyHeight);
    expect(await footerTop(page)).toBe(emptyTop);

    // The same products, without the page's own, on one of them.
    await page.goto(expected[0]?.path as string);
    await expect(shown).toHaveCount(3);
    await expect(shown.first()).toHaveAttribute(
      "href",
      new URL(address, "http://site.test").pathname,
    );

    // Another browser keeps its own history: nothing was sent anywhere.
    const other = await browser.newContext();
    try {
      const otherPage = await other.newPage();
      await otherPage.goto(page.url());
      await expect(otherPage.locator(SPACE)).toHaveAttribute(
        "data-recently-viewed",
        "empty",
      );
    } finally {
      await other.close();
    }
  });

  test("keeps the space's height on a phone, with every related product in the history", async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    const address = await productAddress(request, "de", PRODUCT);
    await opened(page, address);
    const emptyTop = await footerTop(page);
    const links = await page
      .locator(RELATED)
      .evaluateAll((anchors) =>
        anchors.map((a) => a.getAttribute("href") ?? ""),
      );
    for (const link of links) await opened(page, link);
    await opened(page, address);
    await expect(page.locator(SHOWN)).toHaveCount(links.length);
    expect(await footerTop(page)).toBe(emptyTop);
    // Nothing wider than the phone: the list scrolls inside its own strip.
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });

  test("the clear button empties the history and says so", async ({
    page,
    request,
  }) => {
    const address = await productAddress(request, "en", PRODUCT);
    await browse(page, address, 2);
    await opened(page, address);
    const top = await footerTop(page);
    await page.getByRole("button", { name: "Clear history" }).click();

    const status = page.locator(SPACE).getByRole("status");
    await expect(status).toHaveText("Your history has been cleared.");
    await expect(status).toBeFocused();
    await expect(page.locator(SHOWN)).toHaveCount(0);
    expect(
      await page.evaluate((key) => localStorage.getItem(key), HISTORY_KEY),
    ).toBeNull();
    expect(await footerTop(page)).toBe(top);

    // The next page starts a new history with itself only.
    await page.reload();
    await expect(page.locator(SPACE)).toHaveAttribute(
      "data-recently-viewed",
      "empty",
    );
  });

  test("shows only the products viewed in the page's language", async ({
    page,
    request,
  }) => {
    const french = await productAddress(request, "fr", PRODUCT);
    await browse(page, french, 2);
    await opened(page, await productAddress(request, "en", PRODUCT));
    await expect(page.locator(SPACE)).toHaveAttribute(
      "data-recently-viewed",
      "empty",
    );
    await opened(page, french);
    await expect(page.locator(SHOWN)).toHaveCount(2);
  });

  test("drops malformed or edited entries and never renders them as HTML", async ({
    page,
    request,
  }) => {
    const address = await productAddress(request, "fr", PRODUCT);
    // A real entry, read from another product's page.
    const [real] = await browse(page, address, 1);
    if (!real) throw new Error("No related product.");
    const reference = real.path.split("-").at(-1)?.toUpperCase();
    const stored = [
      {
        reference: "SP000777",
        locale: "fr",
        name: "Lien",
        path: "javascript:window.hacked=1",
      },
      {
        reference: "SP000778",
        locale: "fr",
        name: '<img src=x onerror="window.hacked=1">',
        path: "//evil.test/fr/a/b-sp000778",
      },
      {
        reference: "SP000779",
        locale: "fr",
        name: '<img src=x onerror="window.hacked=1">',
        path: "/fr/a/b-sp000779",
      },
      "junk",
      { reference, locale: "fr", name: real.name, path: real.path },
    ];
    await page.evaluate(([key, value]) => localStorage.setItem(key, value), [
      HISTORY_KEY,
      JSON.stringify(stored),
    ] as const);
    await opened(page, address);

    const shown = page.locator(SHOWN);
    // The markup name has a valid address, so it shows, as text.
    await expect(shown).toHaveCount(2);
    await expect(shown.first()).toHaveText(
      '<img src=x onerror="window.hacked=1">',
    );
    await expect(shown.nth(1)).toHaveAttribute("href", real.path);
    await expect(page.locator(`${SPACE} img`)).toHaveCount(0);
    expect(await page.evaluate(() => "hacked" in window)).toBe(false);
    // What is stored again holds only the checked entries.
    const kept = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? "[]"),
      HISTORY_KEY,
    );
    expect(kept.map((entry: { reference: string }) => entry.reference)).toEqual(
      [productReference(PRODUCT), "SP000779", reference],
    );
  });

  test("works as before when storage is blocked", async ({
    browser,
    request,
  }) => {
    const address = await productAddress(request, "fr", PRODUCT);
    const context: BrowserContext = await browser.newContext();
    try {
      await context.addInitScript(() => {
        for (const method of ["getItem", "setItem", "removeItem"] as const)
          Storage.prototype[method] = () => {
            throw new DOMException("Blocked", "SecurityError");
          };
      });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await opened(page, address);
      const related = page.locator(RELATED).first();
      await related.click();
      await expect(page.locator('main[data-template="product"]')).toHaveCount(
        1,
      );
      await page.goBack();
      await expect(page.locator(SPACE)).toHaveAttribute(
        "data-recently-viewed",
        "empty",
      );
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test("two visitors with different histories get the same HTML", async ({
    browser,
    request,
  }) => {
    const address = await productAddress(request, "fr", PRODUCT);
    // Rendered and cached once before either visitor comes.
    expect((await request.get(address)).status()).toBe(200);
    const bodies: string[] = [];
    for (const count of [0, 3]) {
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        if (count > 0) await browse(page, address, count);
        const response = await page.goto(address);
        bodies.push((await response?.text()) ?? "");
      } finally {
        await context.close();
      }
    }
    expect(bodies[0]).toContain("data-recently-viewed");
    expect(bodies[1]).toBe(bodies[0]);
  });
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the space stays empty and the page works", async ({
    page,
    request,
  }) => {
    const address = await productAddress(request, "fr", PRODUCT);
    await opened(page, address);
    const space = page.locator(SPACE);
    await expect(space).toHaveAttribute("data-recently-viewed", "empty");
    await expect(space).toBeEmpty();
    await page.locator(RELATED).first().click();
    await expect(page.locator('main[data-template="product"]')).toHaveCount(1);
    await expect(page.locator(SPACE)).toBeEmpty();
  });
});
