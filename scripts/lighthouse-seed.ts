// A recently viewed history for the product page's Lighthouse runs (issue
// #162, owner decision of 2026-11-16): the page is measured as a returning
// visitor sees it, with the list filled.
//
// A Chrome of its own, on a new profile folder, opens the measured page,
// follows the first SEEDED_PRODUCTS links of its related list (data-list,
// AGENTS.md section 3), each checked to be a product page, then opens the
// measured page again and checks its list shows exactly those products. It
// then closes, and the profile's cache folders are deleted: Lighthouse starts
// its own Chrome on that profile (--user-data-dir, the last one on Chrome's
// command line wins) with its storage reset off, so local storage is kept
// while the HTTP cache, the code cache and the connections start cold, as on
// an unseeded run.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { HISTORY_KEY } from "../site/history.ts";

/** How many products the history holds before the measured page opens. */
export const SEEDED_PRODUCTS = 3;

/** The related list the seeded products are read from (site/related.tsx). */
const RELATED_LINKS = 'main ul[data-list="related"] > li > a';
const SHOWN_LINKS = 'main [data-recently-viewed="list"] ul > li > a';

/** Chrome's cache folders in a profile; local storage is elsewhere. */
const CACHE_FOLDERS = ["Cache", "Code Cache", "GPUCache", "DawnCache"];

/**
 * The system's Chrome: CHROME_PATH, else the stable channel's installation.
 * scripts/lighthouse.ts passes the same one to every Lighthouse CI collect,
 * so the seeding and all the runs use one browser.
 */
export const chromePath = async (): Promise<string> =>
  process.env.CHROME_PATH || (await puppeteer.executablePath("chrome"));

async function open(page: Page, url: string): Promise<void> {
  const response = await page.goto(url, { waitUntil: "load" });
  const status = response?.status() ?? 0;
  // A page opened again may be revalidated from the cache (304). Anything
  // else, a mitigation included, stops everything at once, with no retry
  // (AGENTS.md, section 2).
  if (status !== 200 && status !== 304)
    throw new Error(
      `Seeding: ${new URL(url).pathname} answered ${status}; no retry.`,
    );
  const template = await page.$eval("main", (main) =>
    main.getAttribute("data-template"),
  );
  if (template !== "product")
    throw new Error(
      `Seeding: ${new URL(url).pathname} is a ${template ?? "unmarked"} page, not a product page.`,
    );
}

/** How many products the stored history holds, once the page's script ran. */
const waitForHistory = (page: Page, count: number) =>
  page.waitForFunction(
    (key, expected) => {
      try {
        const value = JSON.parse(window.localStorage.getItem(key) ?? "[]");
        return Array.isArray(value) && value.length >= expected;
      } catch {
        return false;
      }
    },
    { timeout: 30_000 },
    HISTORY_KEY,
    count,
  );

/**
 * Seeds a new profile for one Lighthouse run of the product page at url, and
 * returns its folder, which the caller deletes after the run.
 */
export async function seedProfile(
  url: string,
  headers: Record<string, string>,
  chrome: string,
): Promise<string> {
  const profile = mkdtempSync(join(tmpdir(), "lighthouse-profile-"));
  const browser = await puppeteer.launch({
    executablePath: chrome,
    userDataDir: profile,
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders(headers);
    await open(page, url);
    const links = await page.$$eval(RELATED_LINKS, (anchors) =>
      anchors.map((a) => (a as HTMLAnchorElement).href),
    );
    const seeded = [...new Set(links)].slice(0, SEEDED_PRODUCTS);
    if (seeded.length < SEEDED_PRODUCTS)
      throw new Error(
        `Seeding: ${new URL(url).pathname} lists ${seeded.length} related products, fewer than ${SEEDED_PRODUCTS}.`,
      );
    for (const [index, link] of seeded.entries()) {
      await open(page, link);
      // The measured page is the first entry, then each product opened.
      await waitForHistory(page, index + 2);
    }
    await open(page, url);
    await page.waitForSelector(SHOWN_LINKS, { timeout: 30_000 });
    const shown = await page.$$eval(SHOWN_LINKS, (anchors) =>
      anchors.map((a) => (a as HTMLAnchorElement).href),
    );
    const expected = [...seeded].reverse();
    if (JSON.stringify(shown) !== JSON.stringify(expected))
      throw new Error(
        `Seeding: the list shows ${shown.length} products, not the ${SEEDED_PRODUCTS} opened, newest first.`,
      );
    console.log(
      `Seeded ${new URL(url).pathname} with ${seeded.map((link) => new URL(link).pathname).join(", ")}.`,
    );
  } finally {
    // A graceful close writes local storage to the profile.
    await browser.close();
  }
  for (const folder of CACHE_FOLDERS)
    rmSync(join(profile, "Default", folder), { recursive: true, force: true });
  return profile;
}
