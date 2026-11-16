// The pages the Lighthouse check measures are the templates its checks are
// named after (AGENTS.md, section 3). Twice a section placed first in <main>
// sent the "category" check elsewhere: the terms page (issue #144), then the
// part finder (issue #155). This reads the addresses from the workflow itself
// and resolves them as scripts/lighthouse.ts does, on the build CI tests, so
// a wrong page fails here, before any deployment is measured.
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import {
  firstMainLink,
  linkedAddress,
  mainTemplate,
  pageArguments,
} from "../scripts/lighthouse-report.ts";

/** The <page>=<address> arguments of the workflow's measuring step. */
function workflowPages() {
  const workflow = readFileSync(".github/workflows/lighthouse.yml", "utf8");
  const command =
    /node scripts\/lighthouse\.ts "\$DEPLOY_ENVIRONMENT" "\$DEPLOY_URL"([\s\S]*?)\n\s*#/.exec(
      workflow,
    )?.[1];
  if (!command) throw new Error("No measuring step in the workflow.");
  return pageArguments(command.trim().split(/\s+/));
}

const pages = workflowPages();

test("the workflow measures the ten templates", () => {
  expect(pages.map((p) => p.page).sort()).toEqual([
    "account",
    "brand",
    "cart",
    "category",
    "home",
    "model",
    "product",
    "references",
    "sign-out",
    "sign-up",
  ]);
});

for (const { page, address } of pages) {
  test(`Lighthouse's ${page} address leads to a ${page} page`, async ({
    request,
  }) => {
    const linked = linkedAddress(address);
    let path = address;
    if (linked) {
      const from = await request.get(linked.page);
      expect(from.status(), linked.page).toBe(200);
      const href = firstMainLink(await from.text(), linked.prefix, linked.list);
      expect(href, `${linked.page}: no link to ${linked.prefix}`).toBeTruthy();
      path = href as string;
    }
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(mainTemplate(await response.text()), path).toBe(page);
  });
}
