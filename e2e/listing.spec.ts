// Sorted and filtered category pages (issue #148), served through the query
// rewrites of next.config.ts. Counts, brands and prices are read from the
// pages, never written.
import { expect, type Page, test } from "@playwright/test";
import { categories, slugify } from "../catalog/generator.ts";
import { showcaseProducts } from "../catalog/showcase.ts";
import { PRODUCTS_PER_CATEGORY_PAGE } from "../site/addresses.ts";
import { locationAddress, locationPath } from "./addresses.ts";

const first = categories()[0];
if (!first) throw new Error("No category in the generator.");
const FR = `/fr/${slugify(first.names.fr)}`;
const DE = `/de/${slugify(first.names.de)}`;

/** The prices on a page, in cents, in the order shown. */
const prices = (page: Page) =>
  page
    .getByRole("main")
    .locator("ul.product-list > li > span")
    .evaluateAll((spans) =>
      spans.map((span) => Number((span.textContent ?? "").replace(/\D/g, ""))),
    );

// A showcase product's name is stored, without its brand (ADR 0007).
const showcaseNames = new Set(showcaseProducts.map((p) => p.fr.name));

/** The names of the page's ordinary products, which hold their brand's. */
const productNames = async (page: Page) =>
  (
    await page
      .getByRole("main")
      .locator("ul.product-list > li > a")
      .allTextContents()
  ).filter((name) => !showcaseNames.has(name));

const productCount = (page: Page) =>
  page.getByRole("main").locator("ul.product-list > li").count();

/** The brand filter's options: slug, label and count. */
const brandOptions = (page: Page) =>
  page
    .locator('[data-listing-controls] select[name="brand"] option')
    .evaluateAll((options) =>
      (options as HTMLOptionElement[])
        .filter((option) => option.value)
        .map((option) => ({
          slug: option.value,
          name: (option.textContent ?? "").replace(/\s*\([^)]*\)$/, ""),
          count: Number(
            /\(([^)]*)\)$/
              .exec(option.textContent ?? "")?.[1]
              ?.replace(/\D/g, ""),
          ),
        })),
    );

/** The page's robots tag, or null when it has none. */
const robots = (page: Page) =>
  page.evaluate(
    () =>
      document
        .querySelector('head meta[name="robots"]')
        ?.getAttribute("content") ?? null,
  );

test.describe("the category page's controls", () => {
  test("offer three sorts and the category's brands, whose counts add up to its products", async ({
    page,
  }) => {
    await page.goto(FR);
    const form = page.locator("[data-listing-controls]");
    await expect(form).toHaveAttribute("method", "get");
    await expect(form).toHaveAttribute("action", FR);
    await expect(form.locator('select[name="sort"] option')).toHaveCount(3);
    await expect(form.getByLabel("Trier par")).toHaveValue("reference");
    await expect(form.getByLabel("Marque")).toHaveValue("");
    const brands = await brandOptions(page);
    expect(brands.length).toBeGreaterThan(1);
    const total = Number(
      /(\d[\d\s  ]*)/u
        .exec((await page.locator("[data-intro]").textContent()) ?? "")?.[1]
        ?.replace(/\D/g, ""),
    );
    expect(brands.reduce((sum, b) => sum + b.count, 0)).toBe(total);
    // The plain page keeps its canonical address and stays indexable.
    expect(await robots(page)).toBeNull();
    await expect(page.locator('head link[rel="canonical"]')).toHaveCount(1);
  });
});

test.describe("sorted pages", () => {
  test("sort by price low to high across pages, keep the query in the pager, and stay out of indexes", async ({
    page,
  }) => {
    const response = await page.goto(`${FR}?sort=price-asc`);
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).search).toBe("?sort=price-asc");
    const one = await prices(page);
    expect(one).toHaveLength(PRODUCTS_PER_CATEGORY_PAGE);
    await expect(page.getByLabel("Trier par")).toHaveValue("price-asc");
    expect(await robots(page)).toContain("noindex");
    await expect(page.locator('head link[rel="canonical"]')).toHaveCount(0);
    await expect(page.locator('head link[rel="alternate"]')).toHaveCount(0);
    const next = page.getByRole("main").locator('a[rel="next"]');
    await expect(next).toHaveAttribute("href", `${FR}/2?sort=price-asc`);
    await next.click();
    const two = await prices(page);
    const all = [...one, ...two];
    expect(all).toEqual([...all].sort((a, b) => a - b));
    await expect(
      page.getByRole("main").locator('a[rel="prev"]'),
    ).toHaveAttribute("href", `${FR}?sort=price-asc`);
  });

  test("sort by price high to low", async ({ page }) => {
    await page.goto(`${FR}?sort=price-desc`);
    const shown = await prices(page);
    expect(shown).toEqual([...shown].sort((a, b) => b - a));
  });

  test("answer from the cache on a second visit", async ({ page }) => {
    const stamp = () =>
      page.locator("ul.product-list").getAttribute("data-computed-at");
    await page.goto(`${FR}/2?sort=price-desc`);
    const firstStamp = await stamp();
    await page.goto(`${FR}/2?sort=price-desc`);
    expect(await stamp()).toBe(firstStamp);
  });

  test("an unknown sort shows the plain page", async ({ page }) => {
    await page.goto(`${FR}?sort=popularity`);
    expect(await robots(page)).toBeNull();
    await expect(page.getByLabel("Trier par")).toHaveValue("reference");
  });
});

test.describe("filtered pages", () => {
  test("show only the brand's products, as many as its option says, across pages", async ({
    page,
  }) => {
    await page.goto(FR);
    const brand = [...(await brandOptions(page))].sort(
      (a, b) => b.count - a.count,
    )[0];
    if (!brand) throw new Error("No brand option.");
    const names: string[] = [];
    let shown = 0;
    const pages = Math.ceil(brand.count / PRODUCTS_PER_CATEGORY_PAGE);
    for (let n = 1; n <= pages; n++) {
      const response = await page.goto(
        `${n === 1 ? FR : `${FR}/${n}`}?brand=${brand.slug}`,
      );
      expect(response?.status()).toBe(200);
      names.push(...(await productNames(page)));
      shown += await productCount(page);
    }
    expect(shown).toBe(brand.count);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(name, name).toContain(brand.name);
    await expect(page.getByLabel("Marque")).toHaveValue(brand.slug);
    expect(await robots(page)).toContain("noindex");
    const past = await page.request.get(
      `${FR}/${pages + 1}?brand=${brand.slug}`,
      { maxRedirects: 0 },
    );
    expect(past.status()).toBe(404);
  });

  test("combine a sort and a brand", async ({ page }) => {
    await page.goto(FR);
    const brand = (await brandOptions(page))[0];
    if (!brand) throw new Error("No brand option.");
    await page.goto(`${FR}?sort=price-asc&brand=${brand.slug}`);
    const shown = await prices(page);
    expect(shown.length).toBe(
      Math.min(brand.count, PRODUCTS_PER_CATEGORY_PAGE),
    );
    expect(shown).toEqual([...shown].sort((a, b) => a - b));
    for (const name of await productNames(page))
      expect(name).toContain(brand.name);
  });

  test("an unknown brand redirects to the same sort without it", async ({
    request,
  }) => {
    const response = await request.get(
      `${FR}?sort=price-asc&brand=nosuchbrand`,
      { maxRedirects: 0 },
    );
    expect(response.status()).toBe(307);
    expect(locationAddress(response)).toBe(`${FR}?sort=price-asc`);
  });
});

test.describe("addresses", () => {
  test("another language's slug redirects permanently, keeping the query", async ({
    request,
  }) => {
    const response = await request.get(
      `/de/${slugify(first.names.fr)}?sort=price-asc`,
      {
        maxRedirects: 0,
      },
    );
    expect(response.status()).toBe(308);
    expect(locationAddress(response)).toBe(`${DE}?sort=price-asc`);
  });

  test("a query on another section leaves that page as it is", async ({
    request,
  }) => {
    const brands = await request.get("/fr/marques?sort=price-asc", {
      maxRedirects: 0,
    });
    expect(brands.status()).toBe(307);
    expect(locationPath(brands)).toBe("/fr/marques");
    // The search page keeps its query: a q is never rewritten.
    const search = await request.get("/fr/recherche?q=ab&sort=price-asc", {
      maxRedirects: 0,
    });
    expect(search.status()).toBe(200);
  });

  test("the internal route is never linked, and its plain view redirects to the category", async ({
    request,
  }) => {
    const html = await (await request.get(`${FR}?sort=price-asc`)).text();
    expect(html).not.toContain("/~");
    const plain = await request.get(`${FR}/~reference~-/1`, {
      maxRedirects: 0,
    });
    expect(plain.status()).toBe(308);
    expect(locationPath(plain)).toBe(FR);
  });
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the form applies a sort and a brand, and starts on page 1", async ({
    page,
  }) => {
    await page.goto(`${FR}/2`);
    const brand = (await brandOptions(page))[0];
    if (!brand) throw new Error("No brand option.");
    await page.getByLabel("Trier par").selectOption("price-desc");
    await page.getByLabel("Marque").selectOption(brand.slug);
    await page.getByRole("button", { name: "Appliquer" }).click();
    const url = new URL(page.url());
    expect(url.pathname).toBe(FR);
    expect(url.searchParams.get("sort")).toBe("price-desc");
    expect(url.searchParams.get("brand")).toBe(brand.slug);
    const shown = await prices(page);
    expect(shown).toEqual([...shown].sort((a, b) => b - a));
    for (const name of await productNames(page))
      expect(name).toContain(brand.name);
  });
});
