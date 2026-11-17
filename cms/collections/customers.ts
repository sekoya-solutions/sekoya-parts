import { type CollectionConfig, ValidationError } from "payload";
import {
  ACCOUNT_LOCK_MS,
  ACCOUNT_SESSION_SECONDS,
  MAX_LOGIN_ATTEMPTS,
  passwordProblem,
  usernameProblem,
} from "../../site/account-rules.ts";
import {
  ADDRESS_FIELDS,
  COUNTRIES,
  FIELD_RULES,
  isCountry,
  MAX_ADDRESSES,
} from "../../site/saved-addresses.ts";
import { editorCollectionAccess } from "../access.ts";

export const CUSTOMER_COLLECTION = "customers";

// The shop's demo accounts (docs/adr/0014-customer-accounts.md, issue #177),
// signed in by username with no email address stored. Payload's
// authentication brings the lockout, the sessions stored on the server and
// the password hashing.
//
// Visitors never reach this collection through Payload's API: every rule is
// for editors, and the admin is closed to customers. The site signs up, in
// and out through its own route, app/(site)/api/account/route.ts, with the
// Local API.
//
// The rules on usernames and passwords run before every create and update,
// whatever calls it, Payload's own first-register endpoint included. A
// database trigger caps the collection at MAX_ACCOUNTS rows
// (migrations/20261116_201311_customers.ts).
export const Customers: CollectionConfig = {
  slug: CUSTOMER_COLLECTION,
  access: {
    ...editorCollectionAccess,
    // Never into the admin, editors' rights aside (ADR 0014).
    admin: () => false,
  },
  admin: {
    useAsTitle: "username",
    defaultColumns: ["username", "lastSignInAt", "createdAt"],
  },
  auth: {
    loginWithUsername: { allowEmailLogin: false, requireEmail: false },
    maxLoginAttempts: MAX_LOGIN_ATTEMPTS,
    lockTime: ACCOUNT_LOCK_MS,
    tokenExpiration: ACCOUNT_SESSION_SECONDS,
    useSessions: true,
  },
  fields: [
    {
      // The daily purge deletes an account 30 days after it (cms/accounts).
      name: "lastSignInAt",
      type: "date",
      index: true,
      admin: { readOnly: true },
      access: { create: () => false, update: () => false },
    },
    {
      // Saved addresses (issue #178). Payload stores them in their own
      // table, customers_addresses, whose rows go with the account through
      // its foreign key's ON DELETE CASCADE: "Delete my account" and the
      // purge need nothing more. The site writes them through
      // cms/accounts/saved-addresses.ts, which holds the cap under a lock;
      // maxRows holds it in the admin.
      name: "addresses",
      type: "array",
      maxRows: MAX_ADDRESSES,
      fields: [
        ...ADDRESS_FIELDS.map((name) => ({
          name,
          type: "text" as const,
          required: FIELD_RULES[name].required,
          maxLength: FIELD_RULES[name].max,
        })),
        {
          name: "country",
          type: "text",
          required: true,
          validate: (value: unknown) =>
            isCountry(value) || `One of ${COUNTRIES.join(", ")}.`,
        },
      ],
    },
  ],
  hooks: {
    beforeOperation: [
      ({ args, operation }) => {
        if (operation !== "create" && operation !== "update") return args;
        const data = (args as { data?: Record<string, unknown> }).data ?? {};
        const errors: { message: string; path: string }[] = [];
        if (operation === "create" || data.username !== undefined) {
          const problem = usernameProblem(data.username);
          if (problem) errors.push({ message: problem, path: "username" });
        }
        if (operation === "create" || data.password !== undefined) {
          const problem = passwordProblem(data.password);
          if (problem) errors.push({ message: problem, path: "password" });
        }
        if (errors.length > 0)
          throw new ValidationError({
            collection: CUSTOMER_COLLECTION,
            errors,
          });
        return args;
      },
    ],
    // Every successful sign-in, through any path, moves the purge's date. It
    // passes the sign-in's request, so the write joins its transaction rather
    // than waiting on the row that transaction has just updated.
    afterLogin: [
      async ({ req, user }) => {
        await req.payload.update({
          collection: CUSTOMER_COLLECTION,
          id: user.id,
          data: { lastSignInAt: new Date().toISOString() },
          depth: 0,
          overrideAccess: true,
          req,
        });
      },
    ],
  },
};
