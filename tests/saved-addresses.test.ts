// The saved addresses' rules (issue #178): what a form may send, the
// countries and their names in each language, and the lines a card shows.
import { describe, expect, it } from "vitest";
import { locales } from "../cms/locales.ts";
import {
  ACCOUNT_NOTICES,
  DONE_NOTICES,
  isAccountNotice,
} from "../site/account-rules.ts";
import {
  addressLines,
  COUNTRIES,
  countryOptions,
  DEFAULT_COUNTRY,
  FIELD_RULES,
  MAX_ADDRESSES,
  parseAddress,
  type SavedAddress,
} from "../site/saved-addresses.ts";

const FORM = {
  label: "Maison",
  name: "Marie Dupont",
  line1: "12 rue des Lilas",
  line2: "",
  postalCode: "75011",
  city: "Paris",
  country: "FR",
};

const parse = (values: Record<string, unknown>) =>
  parseAddress((name) => values[name]);

describe("an address form", () => {
  it("is read trimmed, with inner runs of spaces made one", () => {
    expect(
      parse({ ...FORM, name: "  Marie   Dupont ", line2: "  Bât. B  " }),
    ).toEqual({
      address: { ...FORM, name: "Marie Dupont", line2: "Bât. B" },
    });
  });

  it("may leave the label and the second line empty", () => {
    const result = parse({ ...FORM, label: undefined, line2: undefined });
    expect(result).toEqual({ address: { ...FORM, label: "", line2: "" } });
  });

  it("refuses a missing required field", () => {
    for (const field of ["name", "line1", "postalCode", "city"])
      expect(parse({ ...FORM, [field]: "   " })).toEqual({ problem: field });
  });

  it("refuses a field longer than its rule, counted in characters", () => {
    for (const [field, { max }] of Object.entries(FIELD_RULES)) {
      const letter = field === "postalCode" ? "A" : "é";
      expect(
        parse({ ...FORM, [field]: letter.repeat(max) }),
      ).not.toHaveProperty("problem", field);
      expect(parse({ ...FORM, [field]: letter.repeat(max + 1) })).toEqual({
        problem: field,
      });
    }
  });

  it("refuses a line break or another control character", () => {
    expect(parse({ ...FORM, line1: "12 rue\ndes Lilas" })).toEqual({
      problem: "line1",
    });
    expect(parse({ ...FORM, city: "Pa\u0000ris" })).toEqual({
      problem: "city",
    });
  });

  it("refuses a postal code with anything but letters, digits, spaces and hyphens", () => {
    for (const code of ["SW1A 1AA", "1010", "00-950", "D02 X285"])
      expect(parse({ ...FORM, postalCode: code })).toHaveProperty("address");
    for (const code of ["-75011", "75011!", "<b>"])
      expect(parse({ ...FORM, postalCode: code })).toEqual({
        problem: "postalCode",
      });
  });

  it("refuses a country outside the list, or in lowercase", () => {
    for (const country of ["US", "fr", "", undefined, ["FR"]])
      expect(parse({ ...FORM, country })).toEqual({ problem: "country" });
  });

  it("refuses a value that is not text", () => {
    expect(parse({ ...FORM, name: 42 })).toEqual({ problem: "name" });
  });
});

describe("the countries", () => {
  it("hold each language's default, and the cap is the owner's", () => {
    expect(MAX_ADDRESSES).toBe(5);
    for (const locale of locales)
      expect(COUNTRIES).toContain(DEFAULT_COUNTRY[locale]);
  });

  it("are named in each language, in its alphabetical order", () => {
    for (const locale of locales) {
      const options = countryOptions(locale);
      expect(options.map((o) => o.code).sort()).toEqual([...COUNTRIES].sort());
      for (const { code, name } of options) expect(name).not.toBe(code);
      const names = options.map((o) => o.name);
      expect(names).toEqual(
        [...names].sort((a, b) => a.localeCompare(b, locale)),
      );
    }
    expect(countryOptions("fr").find((o) => o.code === "DE")?.name).toBe(
      "Allemagne",
    );
    expect(countryOptions("de").find((o) => o.code === "DE")?.name).toBe(
      "Deutschland",
    );
  });
});

describe("an address card", () => {
  it("shows the lines an envelope shows, leaving out an empty one", () => {
    const address: SavedAddress = { ...FORM, country: "FR" };
    expect(addressLines(address, "fr").map((l) => l.text)).toEqual([
      "Marie Dupont",
      "12 rue des Lilas",
      "75011 Paris",
      "France",
    ]);
    expect(
      addressLines({ ...address, line2: "Bât. B" }, "en").map((l) => l.key),
    ).toEqual(["name", "line1", "line2", "city", "country"]);
  });
});

describe("the account page's notices", () => {
  it("confirm only what is one of the route's outcomes", () => {
    for (const notice of DONE_NOTICES)
      expect(ACCOUNT_NOTICES).toContain(notice);
    for (const notice of ["address-saved", "deleted", "session", "current"])
      expect(isAccountNotice(notice)).toBe(true);
    expect(DONE_NOTICES).not.toContain("current");
    expect(DONE_NOTICES).not.toContain("session");
  });
});
