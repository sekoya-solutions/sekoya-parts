// The demo accounts' addresses and rules (issue #177): the three account
// pages' words, reserved and distinct from every other section's word and
// category slug; the username and password rules Payload and the route
// share; the signed-in cookie the header reads; and the purge's cutoff.
import { describe, expect, it } from "vitest";
import { categoryLocaleRows } from "../catalog/generator.ts";
import { purgeCutoff } from "../cms/accounts/purge.ts";
import { locales } from "../cms/locales.ts";
import {
  ACCOUNT_RETENTION_DAYS,
  isAccountNotice,
  MAX_ACCOUNTS,
  normalizeUsername,
  PASSWORD_MAX,
  PASSWORD_MIN,
  passwordProblem,
  signedInFromCookies,
  signInRefusal,
  USERNAME_MAX,
  usernameProblem,
} from "../site/account-rules.ts";
import {
  ACCOUNT_WORDS,
  accountPageOf,
  accountPagePath,
  accountPath,
  BRAND_WORDS,
  CART_WORDS,
  CATEGORY_SLUG,
  FINDER_WORDS,
  FIT_WORDS,
  INFO_PAGES,
  INFO_SLUGS,
  isReservedWord,
  MODEL_WORDS,
  SEARCH_WORDS,
  SIGN_OUT_WORDS,
  SIGN_UP_WORDS,
} from "../site/addresses.ts";

const accountWords = [ACCOUNT_WORDS, SIGN_UP_WORDS, SIGN_OUT_WORDS];

describe("account words", () => {
  it("are valid category slug forms, reserved, and never another section's word or a generated category slug", () => {
    const others = new Set([
      ...Object.values(BRAND_WORDS),
      ...Object.values(CART_WORDS),
      ...Object.values(FINDER_WORDS),
      ...Object.values(FIT_WORDS),
      ...Object.values(SEARCH_WORDS),
      ...Object.values(MODEL_WORDS),
      ...INFO_PAGES.flatMap((page) => Object.values(INFO_SLUGS[page])),
    ]);
    const categorySlugs = new Set(categoryLocaleRows().map(([, slug]) => slug));
    for (const words of accountWords)
      for (const locale of locales) {
        const word = words[locale];
        expect(word).toMatch(CATEGORY_SLUG);
        expect(isReservedWord(word), word).toBe(true);
        expect(others.has(word), word).toBe(false);
        expect(categorySlugs.has(word), word).toBe(false);
      }
  });

  it("never name two account pages", () => {
    const seen = new Map<string, string>();
    for (const [page, words] of [
      ["account", ACCOUNT_WORDS],
      ["sign-up", SIGN_UP_WORDS],
      ["sign-out", SIGN_OUT_WORDS],
    ] as const)
      for (const word of Object.values(words)) {
        expect(seen.get(word) ?? page, word).toBe(page);
        seen.set(word, page);
      }
  });

  it("are recognised in any language and letter case", () => {
    expect(accountPageOf("mon-compte")).toBe("account");
    expect(accountPageOf("Account")).toBe("account");
    expect(accountPageOf("SIGN-UP")).toBe("sign-up");
    expect(accountPageOf("deconnexion")).toBe("sign-out");
    expect(accountPageOf("compte")).toBeNull();
  });

  it("build each page's address in its language", () => {
    expect(accountPath("fr")).toBe("/fr/mon-compte");
    expect(accountPagePath("en", "sign-up")).toBe("/en/sign-up");
    expect(accountPagePath("de", "sign-out")).toBe("/de/abmelden");
  });
});

describe("usernames", () => {
  it("are compared as Payload stores them: trimmed, in lowercase", () => {
    expect(normalizeUsername("  Alice.B ")).toBe("alice.b");
    expect(normalizeUsername(42)).toBe("");
  });

  it("accept 3 to 32 letters, digits, dots, hyphens and underscores", () => {
    expect(usernameProblem("abc")).toBeNull();
    expect(usernameProblem("Demo_User-1.x")).toBeNull();
    expect(usernameProblem("a".repeat(USERNAME_MAX))).toBeNull();
  });

  it("refuse anything else", () => {
    for (const value of [
      "",
      "ab",
      "a".repeat(USERNAME_MAX + 1),
      "-abc",
      ".abc",
      "a b c",
      "ali@ce",
      "élodie",
      undefined,
      null,
    ])
      expect(usernameProblem(value), String(value)).not.toBeNull();
  });
});

describe("passwords", () => {
  it("accept 12 to 128 characters, counted as a visitor counts them", () => {
    expect(passwordProblem("a".repeat(PASSWORD_MIN))).toBeNull();
    expect(passwordProblem("a".repeat(PASSWORD_MAX))).toBeNull();
    // Twelve emoji are 24 UTF-16 units but twelve characters.
    expect(passwordProblem("🔧".repeat(PASSWORD_MIN))).toBeNull();
    expect(passwordProblem("🔧".repeat(PASSWORD_MIN - 1))).not.toBeNull();
  });

  it("refuse a shorter or a longer one, or none", () => {
    expect(passwordProblem("a".repeat(PASSWORD_MIN - 1))).not.toBeNull();
    expect(passwordProblem("a".repeat(PASSWORD_MAX + 1))).not.toBeNull();
    expect(passwordProblem(undefined)).not.toBeNull();
    expect(passwordProblem("")).not.toBeNull();
  });
});

describe("the signed-in cookie", () => {
  it("is read from document.cookie, among others", () => {
    expect(signedInFromCookies("account_v1=1")).toBe(true);
    expect(signedInFromCookies("cart_v1=1_2; account_v1=1")).toBe(true);
    expect(signedInFromCookies("")).toBe(false);
    expect(signedInFromCookies("account_v1=0")).toBe(false);
    expect(signedInFromCookies("xaccount_v1=1")).toBe(false);
    expect(signedInFromCookies("cart_v1=account_v1=1")).toBe(false);
  });
});

describe("account notices", () => {
  it("accept the route's outcomes only", () => {
    expect(isAccountNotice("locked")).toBe(true);
    expect(isAccountNotice("signed-out")).toBe(true);
    expect(isAccountNotice("<script>")).toBe(false);
    expect(isAccountNotice(["wrong"])).toBe(false);
  });
});

describe("the purge", () => {
  it("deletes accounts whose last sign-in is more than 30 days old", () => {
    expect(ACCOUNT_RETENTION_DAYS).toBe(30);
    expect(purgeCutoff(new Date("2026-12-31T02:00:00Z")).toISOString()).toBe(
      "2026-12-01T02:00:00.000Z",
    );
  });

  it("keeps the cap of ADR 0014", () => {
    expect(MAX_ACCOUNTS).toBe(10_000);
  });
});

describe("sign-in refusals", () => {
  // Errors from another copy of Payload's classes, as Next.js can load the
  // module twice: only their names match Payload's own.
  const named = (name: string) =>
    Object.assign(new Error("from another copy"), { name });

  it("are read from the error's name, whatever class threw it", () => {
    expect(signInRefusal(named("AuthenticationError"))).toBe("wrong");
    expect(signInRefusal(named("ValidationError"))).toBe("wrong");
    expect(signInRefusal(named("LockedAuth"))).toBe("locked");
  });

  it("leave any other error to the route's own handling", () => {
    expect(signInRefusal(new Error("database down"))).toBeNull();
    expect(signInRefusal(named("APIError"))).toBeNull();
    expect(signInRefusal("AuthenticationError")).toBeNull();
    expect(signInRefusal(null)).toBeNull();
  });
});
