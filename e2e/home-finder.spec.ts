// The home page's part finder (issue #196): brand, appliance type and model in
// one form at the top of the page, the brand and model filtered as letters
// are typed, each field unlocked by a valid choice in the one before it, and
// the button leading to the model's page. The old three-step finder's page
// and route are gone, and the site's introduction sits before the footer.
import { expect, type Page, test } from "@playwright/test";
import { locales } from "../cms/locales.ts";
import { MODEL_WORDS } from "../site/addresses.ts";
import { getDictionary } from "../site/dictionary.ts";
import { MODELS_ROUTE } from "../site/finder-rules.ts";

const fr = getDictionary("fr");

const finder = (page: Page) => page.locator("form[data-finder]");
const brandField = (page: Page) =>
  finder(page).getByRole("combobox", { name: fr.finderBrand });
const typeField = (page: Page) => finder(page).getByLabel(fr.finderType);
const modelField = (page: Page) =>
  finder(page).getByRole("combobox", { name: fr.finderModel });
const submit = (page: Page) =>
  finder(page).getByRole("button", { name: fr.finderNext });
const options = (page: Page, list: string) =>
  finder(page).locator(`[data-list="${list}"] [role="option"]`);

/** Opens the home page once its finder's script runs. */
async function openHome(page: Page) {
  await page.goto("/fr");
  await expect(brandField(page)).not.toHaveAttribute("readonly");
}

/** Picks the first brand whose list holds `text`, by mouse. */
async function pickBrand(page: Page, text: string) {
  await brandField(page).click();
  if (text) await brandField(page).fill(text);
  const first = options(page, "finder-brands").first();
  const name = (await first.textContent()) as string;
  await first.click();
  await expect(brandField(page)).toHaveValue(name);
  return name;
}

/** Picks the brand's first appliance type. */
async function pickType(page: Page) {
  await expect(typeField(page)).toBeEnabled();
  const value = (await typeField(page)
    .locator("option:not([disabled])")
    .first()
    .getAttribute("value")) as string;
  await typeField(page).selectOption(value);
  return value;
}

test("the finder opens the page as its <h1>, locked after the brand, and the introduction closes it", async ({
  page,
}) => {
  await openHome(page);
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1 })).toHaveText(
    fr.finderHomeTitle,
  );
  // The finder comes first in <main>, before the promotions.
  const order = await main.evaluate((m) =>
    [...m.querySelectorAll("form[data-finder], .slider, [data-about]")].map(
      (e) =>
        e.matches("form")
          ? "finder"
          : e.matches(".slider")
            ? "slider"
            : "about",
    ),
  );
  expect(order).toEqual(["finder", "slider", "about"]);
  await expect(typeField(page)).toBeDisabled();
  await expect(modelField(page)).toBeDisabled();
  await expect(submit(page)).toBeDisabled();
  // The site's name, tagline and introduction, last in <main>.
  const about = main.locator("[data-about]");
  await expect(about.getByRole("heading", { level: 2 })).toHaveText(
    "Sekoya Parts",
  );
  await expect(about).toContainText(fr.homeTagline);
  await expect(about.locator("[data-intro]")).toHaveCount(1);
  expect(
    await main.evaluate((m) => m.lastElementChild?.hasAttribute("data-about")),
  ).toBe(true);
});

test("the finder's title is the <h1> in every language", async ({ page }) => {
  for (const locale of locales) {
    await page.goto(`/${locale}`);
    await expect(
      page.getByRole("main").getByRole("heading", { level: 1 }),
    ).toHaveText(getDictionary(locale).finderHomeTitle);
  }
});

test("the brand list filters as letters are typed, ignoring case and accents", async ({
  page,
}) => {
  await openHome(page);
  await brandField(page).click();
  const all = await options(page, "finder-brands").allTextContents();
  expect(all.length).toBeGreaterThan(1);
  const letters = all[0]?.slice(0, 2) as string;
  await brandField(page).fill(letters.toUpperCase());
  const filtered = await options(page, "finder-brands").allTextContents();
  const fold = (s: string) =>
    s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  expect(filtered.length).toBeGreaterThan(0);
  expect(filtered.length).toBeLessThanOrEqual(all.length);
  for (const name of filtered) expect(fold(name)).toContain(fold(letters));
  // Names starting with the letters come first.
  expect(fold(filtered[0] as string).startsWith(fold(letters))).toBe(true);
  await brandField(page).fill("zzzzqq");
  await expect(finder(page)).toContainText(
    fr.finderNoBrand.replace("{query}", "zzzzqq"),
  );
  await expect(typeField(page)).toBeDisabled();
});

test("brand, type, then a model typed and picked lead to the model's page", async ({
  page,
}) => {
  await openHome(page);
  await pickBrand(page, "");
  await expect(modelField(page)).toBeDisabled();
  await pickType(page);
  await expect(modelField(page)).toBeEnabled();
  await expect(submit(page)).toBeDisabled();

  // Before anything is typed, the pair's most popular models, 24 at most.
  await modelField(page).click();
  await expect(finder(page)).toContainText(fr.finderPopular);
  const popular = await options(page, "finder-models").allTextContents();
  expect(popular.length).toBeGreaterThan(0);
  expect(popular.length).toBeLessThanOrEqual(24);

  // Typing the start of a reference lists the models it starts.
  const reference = popular[0] as string;
  const start = reference.slice(0, 3);
  await modelField(page).fill(start.toLowerCase());
  await expect(options(page, "finder-models").first()).toBeVisible();
  for (const found of await options(page, "finder-models").allTextContents())
    expect(found.toUpperCase().replace(/[- ]/g, "")).toMatch(
      new RegExp(`^${start.toUpperCase().replace(/[- ]/g, "")}`),
    );

  // The keyboard picks one: down to the first option, then Enter.
  await modelField(page).press("ArrowDown");
  const picked = (await options(page, "finder-models")
    .first()
    .textContent()) as string;
  await modelField(page).press("Enter");
  await expect(modelField(page)).toHaveValue(picked);
  await expect(submit(page)).toBeEnabled();
  await submit(page).click();
  await page.waitForURL(new RegExp(`/fr/${MODEL_WORDS.fr}/`));
  await expect(page.getByRole("main")).toHaveAttribute(
    "data-template",
    "model",
  );
  await expect(page.getByRole("main")).toContainText(picked);
});

test("changing the brand clears the type and the model", async ({ page }) => {
  await openHome(page);
  await pickBrand(page, "");
  await pickType(page);
  await modelField(page).click();
  await options(page, "finder-models").first().click();
  await expect(submit(page)).toBeEnabled();

  await brandField(page).fill("");
  await expect(typeField(page)).toBeDisabled();
  await expect(typeField(page)).toHaveValue("");
  await expect(modelField(page)).toBeDisabled();
  await expect(modelField(page)).toHaveValue("");
  await expect(submit(page)).toBeDisabled();
});

test("only the latest text's models show, whatever order the answers come in", async ({
  page,
}) => {
  await openHome(page);
  await pickBrand(page, "");
  await pickType(page);
  await modelField(page).click();
  const reference = (await options(page, "finder-models")
    .first()
    .textContent()) as string;
  // The answer to the first letter is held back until after the second's.
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let sent: () => void = () => {};
  const firstSent = new Promise<void>((resolve) => {
    sent = resolve;
  });
  let answered: () => void = () => {};
  const firstAnswered = new Promise<void>((resolve) => {
    answered = resolve;
  });
  await page.route(`**${MODELS_ROUTE}?*`, async (route) => {
    const q = new URL(route.request().url()).searchParams.get("q");
    if (q !== "0") return route.continue();
    sent();
    await held;
    // The browser may have dropped the request already: then this throws.
    await route
      .fulfill({
        json: {
          popular: false,
          models: [{ reference: "STALE-0", path: "/fr" }],
        },
      })
      .catch(() => {});
    answered();
  });
  await modelField(page).fill("0");
  await firstSent;
  await modelField(page).fill(reference);
  await expect(options(page, "finder-models").first()).toHaveText(reference);
  release();
  // The held answer comes last and is ignored.
  await firstAnswered;
  await expect(options(page, "finder-models")).not.toContainText(["STALE-0"]);
  await expect(options(page, "finder-models").first()).toHaveText(reference);
});

test("the server's form has the size the script's has, so nothing moves", async ({
  browser,
}) => {
  const box = async (javaScriptEnabled: boolean) => {
    const context = await browser.newContext({ javaScriptEnabled });
    const page = await context.newPage();
    await page.goto("/fr");
    if (javaScriptEnabled)
      await expect(brandField(page)).not.toHaveAttribute("readonly");
    const rect = await finder(page).boundingBox();
    await context.close();
    return rect;
  };
  expect(await box(true)).toEqual(await box(false));
});

test("the models route answers the popular models, a search, or 400", async ({
  request,
  page,
}) => {
  await openHome(page);
  await pickBrand(page, "");
  // The brand's slug and the type, from the finder's own request.
  const asked = page.waitForRequest((r) => r.url().includes(MODELS_ROUTE));
  await pickType(page);
  const params = new URL((await asked).url()).searchParams;
  const brandSlug = params.get("brand") as string;
  const type = params.get("type") as string;
  const popular = await request.get(
    `${MODELS_ROUTE}?lang=fr&brand=${brandSlug}&type=${type}`,
  );
  expect(popular.status()).toBe(200);
  expect(popular.headers()["cache-control"]).toBe("private, no-store");
  const body = (await popular.json()) as {
    popular: boolean;
    models: { reference: string; path: string }[];
  };
  expect(body.popular).toBe(true);
  expect(body.models.length).toBeGreaterThan(0);
  for (const model of body.models)
    expect(model.path.startsWith(`/fr/${MODEL_WORDS.fr}/${brandSlug}-`)).toBe(
      true,
    );
  const search = await request.get(
    `${MODELS_ROUTE}?lang=fr&brand=${brandSlug}&type=${type}&q=${encodeURIComponent(body.models[0]?.reference as string)}`,
  );
  const found = (await search.json()) as typeof body;
  expect(found.popular).toBe(false);
  expect(found.models[0]?.reference).toBe(body.models[0]?.reference);
  for (const bad of [
    `lang=xx&brand=${brandSlug}&type=${type}`,
    `lang=fr&brand=nobrand&type=${type}`,
    `lang=fr&brand=${brandSlug}&type=toaster`,
  ])
    expect((await request.get(`${MODELS_ROUTE}?${bad}`)).status(), bad).toBe(
      400,
    );
});

test("the old three-step finder's addresses and route answer 404", async ({
  request,
}) => {
  const words: Record<string, string> = {
    fr: "trouver-une-piece",
    en: "find-a-part",
    de: "teil-finden",
    es: "buscar-una-pieza",
    it: "trova-un-ricambio",
    nl: "onderdeel-vinden",
    pt: "encontrar-uma-peca",
    pl: "znajdz-czesc",
    sv: "hitta-en-reservdel",
    da: "find-en-reservedel",
  };
  for (const [locale, word] of Object.entries(words)) {
    const response = await request.get(`/${locale}/${word}`, {
      maxRedirects: 0,
    });
    expect(response.status(), word).toBe(404);
  }
  const route = await request.get("/api/finder?lang=fr", { maxRedirects: 0 });
  expect(route.status()).toBe(404);
});
