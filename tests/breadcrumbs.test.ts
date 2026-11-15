// Breadcrumbs' trail and structured data (issue #144).
import { describe, expect, it } from "vitest";
import { breadcrumbList, scriptJson, trail } from "../site/breadcrumbs.tsx";

describe("breadcrumbs", () => {
  it("start the trail at the home page, in the page's language", () => {
    expect(trail("de", [{ name: "Riemen", path: "/de/riemen" }])).toEqual([
      { name: "Startseite", path: "/de" },
      { name: "Riemen", path: "/de/riemen" },
    ]);
  });

  it("give a BreadcrumbList with positions from 1 and full addresses", () => {
    const list = breadcrumbList(
      trail("fr", [
        { name: "Courroie", path: "/fr/courroie" },
        { name: "Courroie X", path: "/fr/courroie/courroie-x-sp000001" },
      ]),
      new URL("https://sekoya-parts.example"),
    );
    expect(list).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Accueil",
          item: "https://sekoya-parts.example/fr",
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Courroie",
          item: "https://sekoya-parts.example/fr/courroie",
        },
        {
          "@type": "ListItem",
          position: 3,
          name: "Courroie X",
          item: "https://sekoya-parts.example/fr/courroie/courroie-x-sp000001",
        },
      ],
    });
  });

  it("escape < in their JSON, so no name can close the script element", () => {
    const json = scriptJson({ name: "</script><b>" });
    expect(json).not.toContain("<");
    expect(JSON.parse(json)).toEqual({ name: "</script><b>" });
  });
});
