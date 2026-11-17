// The home page's part finder (issue #196): how its brand field filters, the
// models route's address, and the removal of the old three-step finder's
// page, whose words no longer reserve any address.
import { describe, expect, it } from "vitest";
import { applianceTypes } from "../catalog/generator.ts";
import {
  isApplianceType,
  isReservedWord,
  POPULAR_MODELS,
} from "../site/addresses.ts";
import {
  filterByName,
  foldText,
  MODELS_ROUTE,
  modelsUrl,
} from "../site/finder-rules.ts";
import { TEMPLATES } from "../site/templates.ts";

const brands = [
  { name: "Bedoren" },
  { name: "Kalméra" },
  { name: "Obeline" },
  { name: "Vexbe" },
];

describe("filterByName", () => {
  it("keeps every option for empty text, in order", () => {
    expect(filterByName(brands, "  ")).toEqual(brands);
  });

  it("lists names starting with the text first, then names holding it", () => {
    expect(filterByName(brands, "be").map((b) => b.name)).toEqual([
      "Bedoren",
      "Obeline",
      "Vexbe",
    ]);
  });

  it("ignores letter case and accents on either side", () => {
    expect(filterByName(brands, "KALME").map((b) => b.name)).toEqual([
      "Kalméra",
    ]);
    expect(filterByName(brands, "mé").map((b) => b.name)).toEqual(["Kalméra"]);
    expect(filterByName(brands, "BÉ").map((b) => b.name)).toEqual([
      "Bedoren",
      "Obeline",
      "Vexbe",
    ]);
  });

  it("finds nothing for text no name holds", () => {
    expect(filterByName(brands, "zz")).toEqual([]);
  });
});

describe("foldText", () => {
  it("drops case, accents and surrounding spaces", () => {
    expect(foldText("  Électro ")).toBe("electro");
  });
});

describe("modelsUrl", () => {
  it("asks the models route for a pair's popular models when nothing is typed", () => {
    expect(modelsUrl("fr", "bedoren", "oven", " ")).toBe(
      `${MODELS_ROUTE}?lang=fr&brand=bedoren&type=oven`,
    );
  });

  it("sends the typed text, trimmed and encoded", () => {
    expect(modelsUrl("de", "bedoren", "dryer", " ab 12&x ")).toBe(
      `${MODELS_ROUTE}?lang=de&brand=bedoren&type=dryer&q=ab+12%26x`,
    );
  });
});

describe("the finder's choices", () => {
  it("accept the generator's appliance types only", () => {
    for (const type of applianceTypes) expect(isApplianceType(type)).toBe(true);
    expect(isApplianceType("toaster")).toBe(false);
  });

  it("list 24 popular models before anything is typed (owner decision)", () => {
    expect(POPULAR_MODELS).toBe(24);
  });
});

describe("the old three-step finder (removed by issue #196)", () => {
  it("has no template and reserves none of its former words", () => {
    expect(TEMPLATES as readonly string[]).not.toContain("finder");
    for (const word of [
      "trouver-une-piece",
      "find-a-part",
      "teil-finden",
      "buscar-una-pieza",
      "trova-un-ricambio",
      "onderdeel-vinden",
      "encontrar-uma-peca",
      "znajdz-czesc",
      "hitta-en-reservdel",
      "find-en-reservedel",
    ])
      expect(isReservedWord(word), word).toBe(false);
  });
});
