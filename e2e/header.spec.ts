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
import { infoPagePath } from "../site/addresses.ts";
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
