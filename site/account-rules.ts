// The demo accounts' rules (docs/adr/0014-customer-accounts.md, issue #177),
// shared by Payload's customers collection, the account route and the
// account pages. Pure values and functions with no Payload or Next.js
// imports, so the unit and end-to-end tests read them too.

/** Failed sign-ins before an account locks: Payload's default. */
export const MAX_LOGIN_ATTEMPTS = 5;

/** How long a locked account stays locked: Payload's default, 10 minutes. */
export const ACCOUNT_LOCK_MS = 10 * 60 * 1000;

/** How long a session lasts: Payload's default, 2 hours. */
export const ACCOUNT_SESSION_SECONDS = 2 * 60 * 60;

/** Demo accounts past which sign-up closes, for Neon's free plan (ADR 0014). */
export const MAX_ACCOUNTS = 10_000;

/** Days after its last sign-in at which the daily purge deletes an account. */
export const ACCOUNT_RETENTION_DAYS = 30;

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 32;

/**
 * A username: lowercase letters, digits, dots, hyphens and underscores,
 * starting with a letter or a digit. Payload lowercases and trims usernames
 * when it stores them and when it signs in, so this is checked on that form.
 */
export const USERNAME = /^[a-z0-9][a-z0-9._-]*$/;

export const PASSWORD_MIN = 12;

/**
 * The longest password accepted: hashing cost grows with the length, and no
 * one types more.
 */
export const PASSWORD_MAX = 128;

/** A username as Payload stores it: trimmed and in lowercase. */
export const normalizeUsername = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

/** Why a username is refused, or null when it is valid. */
export function usernameProblem(value: unknown): string | null {
  const username = normalizeUsername(value);
  if (username.length < USERNAME_MIN || username.length > USERNAME_MAX)
    return `A username has ${USERNAME_MIN} to ${USERNAME_MAX} characters.`;
  if (!USERNAME.test(username))
    return "A username holds lowercase letters, digits, dots, hyphens and underscores, and starts with a letter or a digit.";
  return null;
}

/** Why a password is refused, or null when it is valid. */
export function passwordProblem(value: unknown): string | null {
  if (typeof value !== "string") return "A password is required.";
  // Counted in code points, as a visitor counts characters.
  const length = [...value].length;
  if (length < PASSWORD_MIN || length > PASSWORD_MAX)
    return `A password has ${PASSWORD_MIN} to ${PASSWORD_MAX} characters.`;
  return null;
}

/**
 * The cookie telling the header's browser component that the visitor is
 * signed in (ADR 0013, option B). Payload's own session cookie, readable by
 * the server alone, holds the session; this one holds only "1", is set and
 * cleared with it by the account route, and expires with it.
 */
export const SIGNED_IN_COOKIE = "account_v1";

/** Whether a document.cookie string holds the signed-in cookie. */
export function signedInFromCookies(cookieHeader: string): boolean {
  return cookieHeader
    .split(";")
    .some((pair) => pair.trim() === `${SIGNED_IN_COOKIE}=1`);
}

/** The session cookie Payload reads, shared by every authentication collection. */
export const SESSION_COOKIE = "payload-token";

/** The query parameter carrying an account form's outcome back to its page. */
export const ACCOUNT_NOTICE_PARAM = "account";

/** What an account form's post can lead to, shown on the page it leads to. */
export const ACCOUNT_NOTICES = [
  "wrong",
  "locked",
  "taken",
  "username",
  "password",
  "mismatch",
  "closed",
  "signed-out",
  "error",
] as const;

export type AccountNotice = (typeof ACCOUNT_NOTICES)[number];

export const isAccountNotice = (value: unknown): value is AccountNotice =>
  typeof value === "string" &&
  (ACCOUNT_NOTICES as readonly string[]).includes(value);

/**
 * The notice for an error Payload's sign-in threw, or null for any other
 * error. Read from the error's name, which Payload sets on each of its error
 * classes, never with instanceof: Payload keeps one instance per process on
 * `global`, shared by every copy of its module, and Next.js can load the
 * module twice (for pages and for route handlers), so an error may come from
 * the other copy's class. CI's run on PR #180 showed it: a wrong password
 * reached the route as an AuthenticationError that instanceof refused.
 */
export function signInRefusal(error: unknown): AccountNotice | null {
  const name =
    typeof error === "object" && error !== null && "name" in error
      ? (error as { name: unknown }).name
      : null;
  if (name === "LockedAuth") return "locked";
  if (name === "AuthenticationError" || name === "ValidationError")
    return "wrong";
  return null;
}
