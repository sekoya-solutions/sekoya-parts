// The bare domain's choice of home page (issue #191,
// docs/adr/0011-languages-and-seo.md): the switch's cookie first, then the
// browser's Accept-Language header, then French.
import { describe, expect, it } from "vitest";
import {
  bareDomainLanguage,
  LANGUAGE_COOKIE_MAX_AGE,
  languageCookie,
  languageFromAcceptLanguage,
  languageFromCookies,
} from "../site/language-choice.ts";

describe("languageFromAcceptLanguage", () => {
  it("matches a range by its primary subtag, in any case", () => {
    expect(languageFromAcceptLanguage("en-GB")).toBe("en");
    expect(languageFromAcceptLanguage("pt-BR,pt;q=0.9")).toBe("pt");
    expect(languageFromAcceptLanguage("DE-at")).toBe("de");
    expect(languageFromAcceptLanguage("sv")).toBe("sv");
  });

  it("takes the highest quality first, and the header's order when equal", () => {
    expect(languageFromAcceptLanguage("it;q=0.5, nl;q=0.8")).toBe("nl");
    expect(languageFromAcceptLanguage("da, pl")).toBe("da");
    expect(languageFromAcceptLanguage("es;q=0.7, it;q=0.7")).toBe("es");
    expect(languageFromAcceptLanguage("fr;q=0.9,en")).toBe("en");
  });

  it("skips the languages the site does not have", () => {
    expect(languageFromAcceptLanguage("ja-JP,ja;q=0.9,de;q=0.4")).toBe("de");
    expect(languageFromAcceptLanguage("zh-CN, ru;q=0.8")).toBeNull();
  });

  it("refuses a range of quality 0 and gives * no language", () => {
    expect(languageFromAcceptLanguage("en;q=0, es;q=0.1")).toBe("es");
    expect(languageFromAcceptLanguage("*")).toBeNull();
    expect(languageFromAcceptLanguage("*, it;q=0.2")).toBe("it");
  });

  it("skips a malformed range or quality rather than guess", () => {
    expect(languageFromAcceptLanguage("en;q=2, de;q=0.5")).toBe("de");
    expect(languageFromAcceptLanguage("en;q=high, nl;q=0.3")).toBe("nl");
    expect(languageFromAcceptLanguage("en;q=0.1234, pl;q=0.1")).toBe("pl");
    expect(languageFromAcceptLanguage(";q=1, , da")).toBe("da");
  });

  it("gives no language for a missing or empty header", () => {
    expect(languageFromAcceptLanguage(null)).toBeNull();
    expect(languageFromAcceptLanguage(undefined)).toBeNull();
    expect(languageFromAcceptLanguage("")).toBeNull();
  });
});

describe("languageFromCookies", () => {
  it("reads the switch's cookie among others", () => {
    expect(languageFromCookies("lang_v1=de")).toBe("de");
    expect(languageFromCookies("cart_v1=1_2; lang_v1=sv; account_v1=1")).toBe(
      "sv",
    );
  });

  it("gives no language for a missing, unknown or look-alike cookie", () => {
    expect(languageFromCookies(null)).toBeNull();
    expect(languageFromCookies("")).toBeNull();
    expect(languageFromCookies("lang_v1=xx")).toBeNull();
    expect(languageFromCookies("lang_v1=EN")).toBeNull();
    expect(languageFromCookies("lang_v1=")).toBeNull();
    expect(languageFromCookies("xlang_v1=de")).toBeNull();
    expect(languageFromCookies("cart_v1=lang_v1=de")).toBeNull();
  });
});

describe("languageCookie", () => {
  it("keeps the language for a year on every address, Secure over HTTPS", () => {
    expect(LANGUAGE_COOKIE_MAX_AGE).toBe(31_536_000);
    expect(languageCookie("it", true)).toBe(
      "lang_v1=it; Path=/; Max-Age=31536000; SameSite=Lax; Secure",
    );
    expect(languageCookie("it", false)).toBe(
      "lang_v1=it; Path=/; Max-Age=31536000; SameSite=Lax",
    );
  });

  it("is read back as the language it holds", () => {
    expect(languageFromCookies(languageCookie("nl", true).split(";")[0])).toBe(
      "nl",
    );
  });
});

describe("bareDomainLanguage", () => {
  it("prefers the language picked in the switch over the browser's", () => {
    expect(
      bareDomainLanguage({ cookies: "lang_v1=pl", acceptLanguage: "en-US" }),
    ).toBe("pl");
  });

  it("falls back on the browser's language without a valid cookie", () => {
    expect(
      bareDomainLanguage({ cookies: "lang_v1=xx", acceptLanguage: "es-ES" }),
    ).toBe("es");
    expect(bareDomainLanguage({ cookies: null, acceptLanguage: "da" })).toBe(
      "da",
    );
  });

  it("falls back on French when nothing matches, as for most crawlers", () => {
    expect(bareDomainLanguage({ cookies: null, acceptLanguage: null })).toBe(
      "fr",
    );
    expect(
      bareDomainLanguage({ cookies: "", acceptLanguage: "ja, zh;q=0.5" }),
    ).toBe("fr");
  });
});
