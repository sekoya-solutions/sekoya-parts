// The facts bar, the category menu and the breadcrumbs (issue #144), as the
// built site serves them.
import { expect, type Page, test } from "@playwright/test";
import {
  categories,
  MILLION_PRODUCT_ID,
  MODEL_COUNT,
  slugify,
} from "../catalog/generator.ts";
import { type Locale, locales } from "../cms/locales.ts";
import { SIGNED_IN_COOKIE } from "../site/account-rules.ts";
import { brandIndexPath, infoPagePath } from "../site/addresses.ts";
import { CART_COOKIE } from "../site/cart.ts";
import { fill, getDictionary } from "../site/dictionary.ts";
import { productAddress } from "./addresses.ts";

/** The categories in one language, sorted by name, as the menu lists them. */
const menuEntries = (locale: Locale) =>
  categories()
    .map((category) => ({
      name: category.names[locale],
      href: `/${locale}/${slugify(category.names[locale])}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));

for (const locale of locales) {
  test(`the facts bar and the category menu in ${locale}`, async ({ page }) => {
    await page.goto(`/${locale}`);
    const dictionary = getDictionary(locale);
    // The bar sits before the header's banner landmark.
    const bar = page.locator("[data-facts-bar]");
    await expect(bar).toContainText(
      fill(dictionary.factsModels, {
        models: new Intl.NumberFormat(locale).format(MODEL_COUNT),
      }),
    );
    await expect(
      bar.getByRole("link", { name: dictionary.factsDemo }),
    ).toHaveAttribute("href", infoPagePath(locale, "terms"));

    // Closed, so outside the accessibility tree: found by its label.
    const menu = page.locator(
      `header nav[aria-label="${dictionary.categoriesMenu}"]`,
    );
    const links = await menu.locator("a").evaluateAll((anchors) =>
      anchors.map((a) => ({
        name: a.textContent,
        href: a.getAttribute("href"),
      })),
    );
    expect(links).toEqual(menuEntries(locale));
  });
}

test("the category menu opens by keyboard, with no script", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/en");
  const menu = page.locator('header nav[aria-label="Categories"]');
  await expect(menu).toBeHidden();
  await page.locator("summary", { hasText: "Categories" }).focus();
  await page.keyboard.press("Enter");
  await expect(menu).toBeVisible();
  const [first] = menuEntries("en");
  await menu.getByRole("link", { name: first?.name }).click();
  await expect(page).toHaveURL(new RegExp(`${first?.href}$`));
  await context.close();
});

/** The visible trail and the structured data's, as [name, path] pairs. */
async function crumbs(page: Page, locale: Locale) {
  const nav = page.getByRole("navigation", {
    name: getDictionary(locale).breadcrumb,
  });
  const visible = await nav.locator("li").evaluateAll((items) =>
    items.map((li) => {
      const link = li.querySelector("a");
      return [li.textContent, link ? link.getAttribute("href") : null];
    }),
  );
  await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
  const data = JSON.parse(
    (await page
      .locator('script[type="application/ld+json"]')
      .textContent()) as string,
  );
  expect(data["@type"]).toBe("BreadcrumbList");
  const listed = data.itemListElement.map(
    (item: { position: number; name: string; item: string }, index: number) => {
      expect(item.position).toBe(index + 1);
      return [item.name, new URL(item.item).pathname];
    },
  );
  return { visible, listed };
}

test("breadcrumbs on a category page, a product page, a reference page and a model page", async ({
  page,
  request,
}) => {
  const home = getDictionary("fr").homeCrumb;

  const category = menuEntries("fr")[0] as { name: string; href: string };
  await page.goto(category.href);
  const onCategory = await crumbs(page, "fr");
  expect(onCategory.visible).toEqual([
    [home, "/fr"],
    [category.name, null],
  ]);
  expect(onCategory.listed).toEqual([
    [home, "/fr"],
    [category.name, category.href],
  ]);

  const product = await productAddress(request, "fr", MILLION_PRODUCT_ID);
  await page.goto(product);
  const onProduct = await crumbs(page, "fr");
  const productName = (await page
    .getByRole("heading", { level: 1 })
    .textContent()) as string;
  const productCategory = `/fr/${product.split("/")[2]}`;
  expect(onProduct.listed).toEqual([
    [home, "/fr"],
    [expect.any(String), productCategory],
    [productName, product],
  ]);
  expect(onProduct.visible.map(([, href]) => href)).toEqual([
    "/fr",
    productCategory,
    null,
  ]);

  await page.goto(`${product}/2`);
  const onReferences = await crumbs(page, "fr");
  expect(onReferences.listed.map(([, path]: string[]) => path)).toEqual([
    "/fr",
    productCategory,
    product,
    `${product}/2`,
  ]);

  await page.goto(product);
  const model = (await page
    .getByRole("main")
    .locator("ul > li > a")
    .first()
    .getAttribute("href")) as string;
  await page.goto(model);
  const onModel = await crumbs(page, "fr");
  const modelName = (await page
    .getByRole("heading", { level: 1 })
    .textContent()) as string;
  expect(onModel.listed).toEqual([
    [home, "/fr"],
    [modelName, model],
  ]);
});

// On a phone the header keeps one row: the menu button, the wordmark, and the
// account and cart, which show icons (issues #177 and #181). The menu is a <details>
// element, so it works with JavaScript off too.
const PHONE_WIDTHS = [320, 360];

/** The menu's links, in order, as [name, href] pairs. */
const menuLinks = (locale: Locale) => {
  const dictionary = getDictionary(locale);
  return [
    ...menuEntries(locale).map((entry) => [entry.name, entry.href]),
    [dictionary.brands, brandIndexPath(locale)],
    ...locales
      .filter((other) => other !== locale)
      .map((other) => [getDictionary(other).languageName, `/${other}`]),
  ];
};

const noSidewaysScroll = (page: Page) =>
  page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );

for (const javaScript of [true, false])
  test.describe(`on a phone, JavaScript ${javaScript ? "on" : "off"}`, () => {
    test.use({ javaScriptEnabled: javaScript });

    for (const locale of locales)
      test(`the header holds one row and the menu opens in ${locale}`, async ({
        page,
      }) => {
        const dictionary = getDictionary(locale);
        await page.setViewportSize({ width: 360, height: 740 });
        await page.goto(`/${locale}`);
        const menu = page.locator("header [data-mobile-menu]");
        const button = menu.locator("summary");
        const panel = menu.getByRole("navigation", { name: dictionary.menu });

        for (const width of PHONE_WIDTHS) {
          await page.setViewportSize({ width, height: 740 });
          await expect(button).toHaveAccessibleName(dictionary.menu);
          const account = page.locator("header [data-account-link]");
          const cart = page.locator("header [data-cart-link]");
          await expect(account).toHaveAccessibleName(dictionary.account);
          await expect(cart).toHaveAccessibleName(dictionary.cart);
          await expect(account.locator("svg.header-icon")).toBeVisible();
          await expect(cart.locator("svg.header-icon")).toBeVisible();
          await expect(page.locator("header [data-wide-links]")).toBeHidden();
          // The wordmark, the button, the account and the cart share one row: each
          // one's middle lies within the button's height, and the
          // wordmark holds one line.
          const row = (await button.boundingBox()) as {
            y: number;
            height: number;
          };
          const wordmark = page.locator(`header a[href="/${locale}"]`);
          for (const item of [wordmark, account, cart]) {
            const box = (await item.boundingBox()) as {
              y: number;
              height: number;
            };
            const middle = box.y + box.height / 2;
            expect(middle).toBeGreaterThan(row.y);
            expect(middle).toBeLessThan(row.y + row.height);
          }
          expect((await wordmark.boundingBox())?.height).toBeLessThan(40);
          expect(await noSidewaysScroll(page)).toBe(true);
        }

        await expect(panel).toBeHidden();
        await button.click();
        await expect(panel).toBeVisible();
        await expect(button).toHaveAccessibleName(dictionary.menuClose);
        const links = await panel
          .locator("a")
          .evaluateAll((anchors) =>
            anchors.map((a) => [a.textContent, a.getAttribute("href")]),
          );
        expect(links).toEqual(menuLinks(locale));
        const box = (await panel.boundingBox()) as { x: number; width: number };
        expect(box.x + box.width).toBeLessThanOrEqual(320);
        expect(await noSidewaysScroll(page)).toBe(true);
        await button.click();
        await expect(panel).toBeHidden();
      });
  });

// With a two-digit cart count and the signed-in mark, both badges on their
// icons, the row still holds at 320 px in Swedish, the widest language.
test("the count and the signed-in mark keep the phone header on one row", async ({
  page,
  baseURL,
}) => {
  await page.context().addCookies(
    [
      { name: CART_COOKIE, value: "1_12" },
      { name: SIGNED_IN_COOKIE, value: "1" },
    ].map((cookie) => ({ ...cookie, url: baseURL as string })),
  );
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/sv");
  const account = page.locator("header [data-account-link]");
  const cart = page.locator("header [data-cart-link]");
  await expect(cart.locator('[data-cart-count="12"]')).toBeVisible();
  await expect(
    account.locator('[data-account-state="signed-in"] .account-dot'),
  ).toBeVisible();
  const row = (await page
    .locator("header [data-mobile-menu]")
    .boundingBox()) as { y: number; height: number };
  for (const item of [account, cart]) {
    const box = (await item.boundingBox()) as { y: number; height: number };
    const middle = box.y + box.height / 2;
    expect(middle).toBeGreaterThan(row.y);
    expect(middle).toBeLessThan(row.y + row.height);
  }
  expect(await noSidewaysScroll(page)).toBe(true);
});

// On a phone the facts bar holds one line that scrolls in a loop, with CSS
// only (issue #194).
const facts = (page: Page) => {
  const bar = page.locator("[data-facts-bar]");
  return {
    bar,
    track: bar.locator(".facts-track"),
    lists: bar.locator(".facts-list"),
    copy: bar.locator("[data-facts-copy]"),
  };
};

/** The loop's animation on the track: its name and play state. */
const animation = (track: ReturnType<typeof facts>["track"]) =>
  track.evaluate((element) => {
    const style = getComputedStyle(element);
    return { name: style.animationName, state: style.animationPlayState };
  });

test.describe("the facts bar on a phone", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  for (const locale of locales)
    test(`one scrolling line, read once, in ${locale}`, async ({ page }) => {
      const dictionary = getDictionary(locale);
      await page.goto(`/${locale}`);
      const { bar, track, lists, copy } = facts(page);
      expect((await bar.boundingBox())?.height).toBeLessThan(32);
      expect(await animation(track)).toEqual({
        name: "facts-scroll",
        state: "running",
      });
      // The two lists are as wide as each other and the track holds both, so
      // sliding it by half its width ends where it began.
      const widths = await lists.evaluateAll((uls) =>
        uls.map((ul) => ul.getBoundingClientRect().width),
      );
      expect(widths).toHaveLength(2);
      expect(widths[0]).toBeGreaterThan(360);
      expect(widths[0]).toBeCloseTo(widths[1] as number, 0);
      expect(
        await track.evaluate((element) => element.scrollWidth),
      ).toBeCloseTo((widths[0] as number) * 2, -1);
      // The copy is hidden from screen readers and the keyboard.
      await expect(copy).toHaveAttribute("aria-hidden", "true");
      await expect(copy.locator("a")).toHaveAttribute("tabindex", "-1");
      await expect(
        bar.getByRole("link", { name: dictionary.factsDemo }),
      ).toHaveCount(1);
      await expect(bar.getByRole("listitem")).toHaveCount(3);
      expect(await noSidewaysScroll(page)).toBe(true);
    });

  test("hovering and a tap pause the loop", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 360, height: 740 },
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.goto("/en");
    const { bar, track } = facts(page);
    // A tap on the bar's padding, beside the link: it focuses the bar.
    await page.touchscreen.tap(4, 4);
    await expect(bar).toBeFocused();
    expect((await animation(track)).state).toBe("paused");
    await page.touchscreen.tap(180, 500);
    await expect(bar).not.toBeFocused();
    expect((await animation(track)).state).toBe("running");
    await context.close();
  });

  test("hovering pauses the loop", async ({ page }) => {
    await page.goto("/en");
    const { bar, track } = facts(page);
    await bar.hover({ position: { x: 4, y: 4 } });
    expect((await animation(track)).state).toBe("paused");
    await page.mouse.move(180, 500);
    expect((await animation(track)).state).toBe("running");
  });

  test("the keyboard's focus on the link stops the loop and shows the link", async ({
    page,
  }) => {
    await page.goto("/en");
    const { bar, track, copy } = facts(page);
    const link = bar.getByRole("link", { name: "Demonstration shop" });
    for (let tab = 0; tab < 5 && !(await isFocused(link)); tab++)
      await page.keyboard.press("Tab");
    await expect(link).toBeFocused();
    expect((await animation(track)).name).toBe("none");
    await expect(copy).toBeHidden();
    await expect(link).toBeInViewport({ ratio: 1 });
  });

  test("with reduced motion, a still line scrolled by hand", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/en");
    const { bar, track, copy } = facts(page);
    expect((await animation(track)).name).toBe("none");
    await expect(copy).toBeHidden();
    expect((await bar.boundingBox())?.height).toBeLessThan(32);
    const scroll = await bar.evaluate((element) => ({
      overflow: getComputedStyle(element).overflowX,
      overflows: element.scrollWidth > element.clientWidth,
    }));
    expect(scroll).toEqual({ overflow: "auto", overflows: true });
    expect(await noSidewaysScroll(page)).toBe(true);
  });
});

const isFocused = (locator: ReturnType<Page["locator"]>) =>
  locator.evaluate((element) => element === document.activeElement);

test("on a wide screen the facts bar stays still, its copy not shown", async ({
  page,
}) => {
  await page.goto("/fr");
  const { track, copy } = facts(page);
  expect((await animation(track)).name).toBe("none");
  await expect(copy).toBeHidden();
});

test.describe("the phone menu by keyboard", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test("Escape closes it and gives focus back to its button", async ({
    page,
  }) => {
    await page.goto("/en");
    const button = page.locator("header [data-mobile-menu] summary");
    const panel = page.getByRole("navigation", { name: "Menu" });
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(panel).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(panel.getByRole("link").first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(button).toBeFocused();
  });

  test("focus leaving it or a tap beside it closes it", async ({ page }) => {
    await page.goto("/en");
    const button = page.locator("header [data-mobile-menu] summary");
    const panel = page.getByRole("navigation", { name: "Menu" });
    await button.click();
    await panel.getByRole("link").last().focus();
    await page.keyboard.press("Tab");
    await expect(panel).toBeHidden();

    await button.click();
    await expect(panel).toBeVisible();
    await page.mouse.click(350, 400);
    await expect(panel).toBeHidden();
    await expect(page).toHaveURL(/\/en$/);
  });

  test("with no script, Enter opens and closes it and Tab moves into it", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 360, height: 740 },
    });
    const page = await context.newPage();
    await page.goto("/en");
    const button = page.locator("header [data-mobile-menu] summary");
    const panel = page.getByRole("navigation", { name: "Menu" });
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(panel).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(panel.getByRole("link").first()).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(button).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(panel).toBeHidden();
    await context.close();
  });
});

test("on a wide screen the header keeps its links and shows no menu", async ({
  page,
}) => {
  await page.goto("/fr");
  await expect(page.locator("header [data-mobile-menu]")).toBeHidden();
  await expect(page.locator("header [data-wide-links]")).toBeVisible();
  for (const link of ["[data-account-link]", "[data-cart-link]"]) {
    await expect(page.locator(`header ${link} svg.header-icon`)).toBeHidden();
  }
  await expect(page.locator("header [data-account-link]")).toHaveText(/Compte/);
  await expect(page.locator("header [data-cart-link]")).toHaveText(/Panier/);
});
