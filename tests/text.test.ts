// Generated product text (docs/adr/0007-catalog-data-model.md): pure
// functions, tested without a database.
import { describe, expect, it } from "vitest";
import {
  parseProductId,
  placeholderDescription,
  productName,
} from "../catalog/text.ts";
import { locales } from "../cms/locales.ts";

describe("placeholderDescription", () => {
  it("gives the same text for the same product and language", () => {
    expect(placeholderDescription(42, "fr")).toBe(
      placeholderDescription(42, "fr"),
    );
  });

  it("gives each language and each product its own text", () => {
    const texts = new Set(locales.map((l) => placeholderDescription(42, l)));
    expect(texts.size).toBe(locales.length);
    expect(placeholderDescription(43, "fr")).not.toBe(
      placeholderDescription(42, "fr"),
    );
  });

  it("writes three to five capitalised sentences", () => {
    for (let id = 1; id <= 200; id++) {
      const sentences = placeholderDescription(id, "en").split(". ");
      expect(sentences.length).toBeGreaterThanOrEqual(3);
      expect(sentences.length).toBeLessThanOrEqual(5);
      for (const sentence of sentences) expect(sentence).toMatch(/^[A-Z]/);
    }
  });

  // Pins the output, so a change to the generator is a visible decision:
  // cached descriptions would otherwise differ between deployments.
  it("keeps a known output", () => {
    expect(placeholderDescription(1, "fr")).toMatchSnapshot();
  });
});

describe("productName", () => {
  it("joins the part type, the brand and the reference", () => {
    expect(productName("Courroie", "Kalavox", "SP000001")).toBe(
      "Courroie Kalavox SP000001",
    );
  });
});

describe("parseProductId", () => {
  it("accepts positive integers that fit an integer column", () => {
    expect(parseProductId("1")).toBe(1);
    expect(parseProductId("2147483647")).toBe(2_147_483_647);
  });

  it("rejects anything else", () => {
    for (const raw of ["", "0", "01", "-1", "1.5", "1e3", " 1", "abc"]) {
      expect(parseProductId(raw)).toBeNull();
    }
    expect(parseProductId("2147483648")).toBeNull();
    expect(parseProductId("99999999999")).toBeNull();
  });
});
