// The account pages (issue #177, docs/adr/0014-customer-accounts.md), in
// every language at /<lang>/<word>:
// - the account address, where the header's link leads: the sign-in form for
//   a visitor who is not signed in, the username and a sign-out button for a
//   customer. The account page's own content (issue #178) comes here;
// - the sign-up page;
// - the sign-out page, which confirms the sign-out and asks for it.
//
// Each reads the request outside any <Suspense> boundary, on each visit, as
// the cart page does (ADR 0013): its HTML comes complete, without
// JavaScript. Every form posts to the account route,
// app/(site)/api/account/route.ts, which leads back to one of these pages
// with a notice. Kept out of search engines' indexes and of the sitemap;
// robots.txt already disallows them (site/crawl.ts).

import config from "@payload-config";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { getPayload } from "payload";
import { CUSTOMER_COLLECTION } from "../cms/collections/customers.ts";
import type { Locale } from "../cms/locales.ts";
import {
  ACCOUNT_NOTICE_PARAM,
  type AccountNotice,
  isAccountNotice,
  MAX_ACCOUNTS,
  PASSWORD_MAX,
  PASSWORD_MIN,
  USERNAME_MAX,
  USERNAME_MIN,
} from "./account-rules.ts";
import { type SignedInCustomer, signedInCustomer } from "./account-session.ts";
import {
  type AccountPage,
  accountPageOf,
  accountPagePath,
  perLocale,
} from "./addresses.ts";
import { type Dictionary, fill, getDictionary } from "./dictionary.ts";
import { SiteFrame } from "./frame.tsx";

/** Where every account form posts. */
export const ACCOUNT_ROUTE = "/api/account";

const TITLES: Record<AccountPage, keyof Dictionary> = {
  account: "accountTitle",
  "sign-up": "signUpTitle",
  "sign-out": "signOutTitle",
};

export function accountMetadata(locale: Locale, section: string): Metadata {
  const page = accountPageOf(section) ?? "account";
  return {
    title: `${getDictionary(locale)[TITLES[page]]} | Sekoya Parts`,
    robots: { index: false },
  };
}

/** A refusal's message; the sign-out's confirmation is shown on its own. */
function noticeText(dictionary: Dictionary, notice: AccountNotice): string {
  switch (notice) {
    case "wrong":
      return dictionary.accountWrong;
    case "locked":
      return dictionary.accountLocked;
    case "taken":
      return dictionary.accountTaken;
    case "username":
      return dictionary.accountUsernameInvalid;
    case "password":
      return dictionary.accountPasswordInvalid;
    case "mismatch":
      return dictionary.accountMismatch;
    case "closed":
      return dictionary.signUpClosed;
    case "signed-out":
      return dictionary.signOutDone;
    default:
      return dictionary.accountError;
  }
}

function Notice({
  notice,
  dictionary,
}: {
  notice: AccountNotice | null;
  dictionary: Dictionary;
}) {
  if (!notice) return null;
  return (
    <p
      role={notice === "signed-out" ? "status" : "alert"}
      data-account-notice={notice}
      className="mt-4 font-bold"
    >
      {noticeText(dictionary, notice)}
    </p>
  );
}

function Hidden({ locale, intent }: { locale: Locale; intent: string }) {
  return (
    <>
      <input type="hidden" name="lang" value={locale} />
      <input type="hidden" name="intent" value={intent} />
    </>
  );
}

function UsernameField({
  dictionary,
  hint,
}: {
  dictionary: Dictionary;
  hint?: boolean;
}) {
  return (
    <p>
      <label htmlFor="account-username">{dictionary.accountUsername}</label>
      <input
        id="account-username"
        name="username"
        type="text"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        minLength={USERNAME_MIN}
        maxLength={USERNAME_MAX}
        required
        aria-describedby={hint ? "account-username-hint" : undefined}
      />
      {hint && (
        <span id="account-username-hint" className="account-hint">
          {dictionary.signUpUsernameHint}
        </span>
      )}
    </p>
  );
}

function PasswordField({
  id,
  name,
  label,
  autoComplete,
  hint,
}: {
  id: string;
  name: string;
  label: string;
  autoComplete: "current-password" | "new-password";
  hint?: string;
}) {
  return (
    <p>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={name}
        type="password"
        autoComplete={autoComplete}
        // Sign-in takes any length: an account's password has its own.
        minLength={autoComplete === "new-password" ? PASSWORD_MIN : undefined}
        maxLength={PASSWORD_MAX}
        required
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      {hint && (
        <span id={`${id}-hint`} className="account-hint">
          {hint}
        </span>
      )}
    </p>
  );
}

function SignOutForm({
  locale,
  dictionary,
}: {
  locale: Locale;
  dictionary: Dictionary;
}) {
  return (
    <form method="post" action={ACCOUNT_ROUTE} className="mt-4">
      <Hidden locale={locale} intent="sign-out" />
      <button type="submit" className="account-button">
        {dictionary.signOutButton}
      </button>
    </form>
  );
}

function SignedIn({
  customer,
  locale,
  dictionary,
}: {
  customer: SignedInCustomer;
  locale: Locale;
  dictionary: Dictionary;
}) {
  return (
    <div data-account="signed-in">
      <p className="mt-6 text-lg">
        {fill(dictionary.accountSignedInAs, { username: customer.username })}
      </p>
      <SignOutForm locale={locale} dictionary={dictionary} />
    </div>
  );
}

function SignInForm({
  locale,
  dictionary,
}: {
  locale: Locale;
  dictionary: Dictionary;
}) {
  return (
    <div data-account="signed-out">
      <h2 className="mt-6 text-2xl font-bold">{dictionary.signInTitle}</h2>
      <form
        method="post"
        action={ACCOUNT_ROUTE}
        className="account-form mt-4"
        data-account-form="sign-in"
      >
        <Hidden locale={locale} intent="sign-in" />
        <UsernameField dictionary={dictionary} />
        <PasswordField
          id="account-password"
          name="password"
          label={dictionary.accountPassword}
          autoComplete="current-password"
        />
        <button type="submit" className="account-button">
          {dictionary.signInButton}
        </button>
      </form>
      <p data-no-reset className="mt-4 text-slate">
        {dictionary.signInNoReset}
      </p>
      <p className="mt-4">
        {dictionary.signUpPrompt}{" "}
        <a href={accountPagePath(locale, "sign-up")}>{dictionary.signUpLink}</a>
      </p>
    </div>
  );
}

function SignUpForm({
  locale,
  dictionary,
}: {
  locale: Locale;
  dictionary: Dictionary;
}) {
  return (
    <>
      <form
        method="post"
        action={ACCOUNT_ROUTE}
        className="account-form mt-6"
        data-account-form="sign-up"
      >
        <Hidden locale={locale} intent="sign-up" />
        <UsernameField dictionary={dictionary} hint />
        <PasswordField
          id="account-password"
          name="password"
          label={dictionary.accountPassword}
          autoComplete="new-password"
          hint={dictionary.signUpPasswordHint}
        />
        <PasswordField
          id="account-confirm"
          name="confirm"
          label={dictionary.accountPasswordConfirm}
          autoComplete="new-password"
        />
        <button type="submit" className="account-button">
          {dictionary.signUpButton}
        </button>
      </form>
      <p className="mt-4 text-slate">{dictionary.signUpRetention}</p>
      <p data-no-reset className="mt-2 text-slate">
        {dictionary.signInNoReset}
      </p>
    </>
  );
}

async function accountCount(): Promise<number> {
  const payload = await getPayload({ config });
  const { totalDocs } = await payload.count({
    collection: CUSTOMER_COLLECTION,
    overrideAccess: true,
  });
  return totalDocs;
}

async function AccountContents({
  locale,
  page,
  searchParams,
}: {
  locale: Locale;
  page: AccountPage;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const dictionary = getDictionary(locale);
  const [requestHeaders, query] = await Promise.all([headers(), searchParams]);
  const raw = query[ACCOUNT_NOTICE_PARAM];
  const notice = isAccountNotice(raw) ? raw : null;
  const customer = await signedInCustomer(new Headers(requestHeaders));

  if (page === "account")
    return (
      <>
        <Notice notice={notice} dictionary={dictionary} />
        {customer ? (
          <SignedIn
            customer={customer}
            locale={locale}
            dictionary={dictionary}
          />
        ) : (
          <SignInForm locale={locale} dictionary={dictionary} />
        )}
      </>
    );

  if (page === "sign-up") {
    if (customer)
      return (
        <SignedIn customer={customer} locale={locale} dictionary={dictionary} />
      );
    const closed = (await accountCount()) >= MAX_ACCOUNTS;
    return (
      <div data-account={closed ? "closed" : "signed-out"}>
        {closed ? (
          <p role="alert" data-account-notice="closed" className="mt-4">
            {dictionary.signUpClosed}
          </p>
        ) : (
          <>
            <Notice notice={notice} dictionary={dictionary} />
            <SignUpForm locale={locale} dictionary={dictionary} />
          </>
        )}
        <p className="mt-4">
          {dictionary.signInPrompt}{" "}
          <a href={accountPagePath(locale, "account")}>
            {dictionary.signInLink}
          </a>
        </p>
      </div>
    );
  }

  // The sign-out page.
  return (
    <div data-account={customer ? "signed-in" : "signed-out"}>
      <Notice notice={notice} dictionary={dictionary} />
      {customer ? (
        <>
          <p className="mt-6">
            {fill(dictionary.accountSignedInAs, {
              username: customer.username,
            })}{" "}
            {dictionary.signOutConfirm}
          </p>
          <SignOutForm locale={locale} dictionary={dictionary} />
        </>
      ) : (
        <>
          {notice !== "signed-out" && (
            <p className="mt-6">{dictionary.signOutNotSignedIn}</p>
          )}
          <p className="mt-4">
            <a href={accountPagePath(locale, "account")}>
              {dictionary.signInLink}
            </a>
          </p>
        </>
      )}
    </div>
  );
}

export function AccountPageView({
  locale,
  section,
  searchParams,
}: {
  locale: Locale;
  section: string;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const page = accountPageOf(section) ?? "account";
  const dictionary = getDictionary(locale);
  return (
    <SiteFrame
      locale={locale}
      template={page}
      paths={perLocale((other) => accountPagePath(other, page))}
    >
      <h1 className="text-3xl font-bold sm:text-4xl">
        {dictionary[TITLES[page]]}
      </h1>
      <p data-demo-notice className="mt-2 text-slate">
        {dictionary.accountDemo}
      </p>
      <AccountContents
        locale={locale}
        page={page}
        searchParams={searchParams}
      />
    </SiteFrame>
  );
}
