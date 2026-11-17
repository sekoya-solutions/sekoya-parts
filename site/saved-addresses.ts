// The saved addresses of a demo account (issue #178,
// docs/adr/0014-customer-accounts.md): at most MAX_ADDRESSES per account,
// each with a few short fields and a country from a fixed list. Shared by
// Payload's customers collection, the account route and the account page.
// Pure values and functions with no Payload or Next.js imports, so the unit
// and end-to-end tests read them too.
import type { Locale } from "../cms/locales.ts";

/** Saved addresses per account (owner decision, 2026-11-16). */
export const MAX_ADDRESSES = 5;

/**
 * The countries an address may be in: those where the site's ten languages
 * are spoken, as ISO 3166-1 alpha-2 codes. The page names each in its own
 * language through Intl.DisplayNames, so no dictionary holds them.
 */
export const COUNTRIES = [
  "AT",
  "BE",
  "CH",
  "DE",
  "DK",
  "ES",
  "FR",
  "GB",
  "IE",
  "IT",
  "LU",
  "NL",
  "PL",
  "PT",
  "SE",
] as const;

export type Country = (typeof COUNTRIES)[number];

export const isCountry = (value: unknown): value is Country =>
  typeof value === "string" && (COUNTRIES as readonly string[]).includes(value);

/** The country an empty form proposes in each language. */
export const DEFAULT_COUNTRY: Record<Locale, Country> = {
  fr: "FR",
  en: "GB",
  de: "DE",
  es: "ES",
  it: "IT",
  nl: "NL",
  pt: "PT",
  pl: "PL",
  sv: "SE",
  da: "DK",
};

/** An address's text fields, in the form's order. */
export const ADDRESS_FIELDS = [
  "label",
  "name",
  "line1",
  "line2",
  "postalCode",
  "city",
] as const;

export type AddressField = (typeof ADDRESS_FIELDS)[number];

/** A saved address, as the route receives it and the page shows it. */
export type SavedAddress = Record<AddressField, string> & { country: Country };

/** Each text field's longest value, in characters, and whether it is required. */
export const FIELD_RULES: Record<
  AddressField,
  { max: number; required: boolean }
> = {
  label: { max: 40, required: false },
  name: { max: 80, required: true },
  line1: { max: 100, required: true },
  line2: { max: 100, required: false },
  postalCode: { max: 12, required: true },
  city: { max: 60, required: true },
};

/** A postal code: letters, digits, spaces and hyphens, starting with one of the first two. */
export const POSTAL_CODE = /^[A-Za-z0-9][A-Za-z0-9 -]*$/;

// Control characters, line breaks included: every field is one line.
// biome-ignore lint/suspicious/noControlCharactersInRegex: that is what it finds.
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

/** A field's value as stored: trimmed, inner runs of spaces made one. */
export const normalizeField = (value: unknown): string =>
  typeof value === "string" ? value.trim().replace(/ {2,}/g, " ") : "";

/**
 * An address read from a form's fields, or the first field that is wrong.
 * Lengths are counted in code points, as a visitor counts characters.
 */
export function parseAddress(
  read: (name: string) => unknown,
): { address: SavedAddress } | { problem: AddressField | "country" } {
  const values = {} as Record<AddressField, string>;
  for (const field of ADDRESS_FIELDS) {
    const value = normalizeField(read(field));
    const rule = FIELD_RULES[field];
    const length = [...value].length;
    if (
      (rule.required && length === 0) ||
      length > rule.max ||
      CONTROL.test(value) ||
      (field === "postalCode" && length > 0 && !POSTAL_CODE.test(value))
    )
      return { problem: field };
    values[field] = value;
  }
  const country = read("country");
  if (!isCountry(country)) return { problem: "country" };
  return { address: { ...values, country } };
}

/** The countries in a language's alphabetical order, with their names in it. */
export function countryOptions(
  locale: Locale,
): { code: Country; name: string }[] {
  const names = new Intl.DisplayNames([locale], { type: "region" });
  return COUNTRIES.map((code) => ({ code, name: names.of(code) ?? code })).sort(
    (a, b) => a.name.localeCompare(b.name, locale),
  );
}

/** An address's lines as an envelope shows them, empty ones left out. */
export function addressLines(
  address: SavedAddress,
  locale: Locale,
): { key: string; text: string }[] {
  const country =
    new Intl.DisplayNames([locale], { type: "region" }).of(address.country) ??
    address.country;
  return [
    { key: "name", text: address.name },
    { key: "line1", text: address.line1 },
    { key: "line2", text: address.line2 },
    { key: "city", text: `${address.postalCode} ${address.city}` },
    { key: "country", text: country },
  ].filter((line) => line.text.trim() !== "");
}
