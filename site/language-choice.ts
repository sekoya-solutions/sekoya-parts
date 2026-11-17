// Which home page the bare domain sends a visitor to (issue #191,
// docs/adr/0011-languages-and-seo.md): the language last picked in the
// language switch, kept in a cookie; else the best of the ten languages in
// the browser's Accept-Language header; else French, the source language.
// Shared by the bare domain's route and the switch's browser script, so both
// agree on the cookie's name and format.
import { type Locale, locales } from "../cms/locales.ts";

/** The cookie holding the language last picked in the language switch. */
export const LANGUAGE_COOKIE = "lang_v1";

/** How long the browser keeps that cookie: one year, in seconds. */
export const LANGUAGE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

/**
 * The attribute naming the language a switch link picks. Kept here, outside
 * the "use client" module, as a server component importing a constant from
 * one gets a client reference rather than the string.
 */
export const LANGUAGE_PICK = "data-language-pick";

/**
 * Set on <html> once the switch's listener is in place, the signal a test
 * waits for before following a link, rather than a delay.
 */
export const LANGUAGE_PICK_READY = "data-language-pick-ready";

/** The language of a visitor who names none of the ten. */
export const DEFAULT_LOCALE: Locale = "fr";

export const isLocale = (value: string): value is Locale =>
  (locales as readonly string[]).includes(value);

/**
 * The language a Cookie header (or document.cookie) holds, or null when the
 * cookie is missing or holds anything but one of the ten language codes.
 */
export function languageFromCookies(
  cookies: string | null | undefined,
): Locale | null {
  for (const pair of (cookies ?? "").split(";")) {
    const at = pair.indexOf("=");
    if (at < 0 || pair.slice(0, at).trim() !== LANGUAGE_COOKIE) continue;
    const value = pair.slice(at + 1).trim();
    return isLocale(value) ? value : null;
  }
  return null;
}

/** The cookie the switch's script writes, as document.cookie takes it. */
export function languageCookie(locale: Locale, secure: boolean): string {
  return `${LANGUAGE_COOKIE}=${locale}; Path=/; Max-Age=${LANGUAGE_COOKIE_MAX_AGE}; SameSite=Lax${secure ? "; Secure" : ""}`;
}

const QUALITY = /^q=(0(\.\d{0,3})?|1(\.0{0,3})?)$/i;

/**
 * The best of the ten languages in an Accept-Language header (RFC 9110,
 * section 12.5.4), or null when none matches. Ranges are taken by quality,
 * highest first, in the header's order when equal; a range matches by its
 * primary subtag, so `en-GB` and `pt-BR` give `en` and `pt`. A quality of 0
 * refuses a range, `*` names no language, and a malformed range or quality
 * is skipped rather than guessed.
 */
export function languageFromAcceptLanguage(
  header: string | null | undefined,
): Locale | null {
  const ranges: { locale: Locale; quality: number; order: number }[] = [];
  (header ?? "").split(",").forEach((part, order) => {
    const [range = "", ...parameters] = part
      .split(";")
      .map((piece) => piece.trim());
    let quality = 1;
    for (const parameter of parameters) {
      if (!QUALITY.test(parameter)) return;
      quality = Number(parameter.slice(2));
    }
    if (quality === 0) return;
    const primary = range.split("-")[0]?.toLowerCase() ?? "";
    if (isLocale(primary)) ranges.push({ locale: primary, quality, order });
  });
  ranges.sort((a, b) => b.quality - a.quality || a.order - b.order);
  return ranges[0]?.locale ?? null;
}

/** The home page language for a request to the bare domain. */
export function bareDomainLanguage(request: {
  cookies: string | null | undefined;
  acceptLanguage: string | null | undefined;
}): Locale {
  return (
    languageFromCookies(request.cookies) ??
    languageFromAcceptLanguage(request.acceptLanguage) ??
    DEFAULT_LOCALE
  );
}
