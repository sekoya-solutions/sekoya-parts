// No dictionary in the browser's scripts (issue #209): pages render their
// labels on the server, and the browser components get only the labels they
// show. Next.js loads the 404's code with every page under a language, and
// that code once imported the ten dictionaries, about 140 KB of script that a
// page never ran. A French page has no use for a Danish sentence, so any
// Danish label in its scripts, other than the 404 page's own four, means a
// dictionary was bundled.
import { expect, type Page, test } from "@playwright/test";
import { getDictionary } from "../site/dictionary.ts";
import { NOT_FOUND_KEYS } from "../site/not-found-texts.ts";

const french = new Set<string>(Object.values(getDictionary("fr")));
/** Danish sentences that only a bundled dictionary would put in a script. */
const danish = Object.entries(getDictionary("da"))
  .filter(
    ([key, value]) =>
      !(NOT_FOUND_KEYS as readonly string[]).includes(key) &&
      value.length >= 30 &&
      !french.has(value),
  )
  .map(([, value]) => value);

/** Opens `address` and returns every script it loaded, by address. */
async function scriptsOf(page: Page, address: string) {
  const scripts = new Map<string, Promise<string>>();
  page.on("response", (response) => {
    if (response.request().resourceType() === "script")
      scripts.set(response.url(), response.text());
  });
  await page.goto(address, { waitUntil: "load" });
  return Promise.all(
    [...scripts].map(async ([url, text]) => ({ url, text: await text })),
  );
}

test("a French page's scripts hold no Danish label", async ({ page }) => {
  expect(danish.length).toBeGreaterThan(20);
  const scripts = await scriptsOf(page, "/fr");
  expect(scripts.length).toBeGreaterThan(0);
  for (const { url, text } of scripts)
    for (const label of danish)
      expect(text.includes(label), `${url} holds "${label}"`).toBe(false);
});
