// The product page on the small catalog (issue #60): its parts, its reference
// list and its 404.
import { expect, test } from "@playwright/test";
import { MILLION_PRODUCT_ID } from "../catalog/generator.ts";
import { PRODUCT_PAGE_REFERENCES } from "../site/references.ts";

test("the home page answers 200", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Sekoya Parts",
  );
});

test("product 1 shows its heading, price, description and references", async ({
  page,
}) => {
  const response = await page.goto(`/product/${MILLION_PRODUCT_ID}`);
  expect(response?.status()).toBe(200);

  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1 })).not.toBeEmpty();
  // The price part: a euro amount in French format, such as "12,34 €".
  await expect(main.locator("p").first()).toHaveText(/^[\d\s ]+,\d{2}\s€$/u);
  // The description part: placeholder text for a non-showcase product.
  await expect(main.locator("p").nth(1)).not.toBeEmpty();

  // Product 1 is compatible with every model, so it reaches the cap.
  const links = main.locator("ul > li > a");
  await expect(links).toHaveCount(PRODUCT_PAGE_REFERENCES + 1);
  for (const href of await links.evaluateAll((anchors) =>
    anchors.map((a) => a.getAttribute("href")),
  )) {
    expect(href).toMatch(/^\/model\/\d+$/);
  }
});

for (const id of ["999999999", "abc"]) {
  test(`a missing product (${id}) answers 404`, async ({ page }) => {
    const response = await page.goto(`/product/${id}`);
    expect(response?.status()).toBe(404);
  });
}
