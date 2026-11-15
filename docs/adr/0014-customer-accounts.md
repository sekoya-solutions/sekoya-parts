# ADR 0014: Customer accounts

- Status: Accepted
- Date: 2026-11-15
- Deciders: Owner

## Context

Phase 4 ([#138](https://github.com/sekoya-solutions/sekoya-parts/issues/138)) adds customer accounts to the demo shop: sign-up, sign-in, saved addresses, order history and account deletion. This Architecture Decision Record (ADR) chooses how they work. The forces:

- **Scope** ([AGENTS.md](../../AGENTS.md), section 1): no email is sent, so there is no address verification and no password reset by email.
- **Payload 3** already runs inside the app, with one authentication collection, `users`, for editors and the automation user ([ADR 0006](0006-content-management.md)).
- **Visitor state** stays out of the cached catalog pages ([ADR 0013](0013-visitor-state.md)).
- **Personal data:** whatever is stored falls under the General Data Protection Regulation (GDPR): the privacy page says what is kept and for how long, and it is deleted on request.
- **Abuse:** the sign-up and sign-in forms are public, behind Bot Protection on Challenge and the firewall's rate limit ([ADR 0002](0002-hosting-and-environments.md)).

### Criteria

1. Security of the catalog and the admin.
2. As little personal data as possible.
3. Code to write and review.
4. Fit with Payload and the free plans.

## Options considered

Facts were checked on 2026-11-15, in the source of the installed Payload 3.93.0:

- A project can have several authentication collections. Only the collection named in `admin.user`, or one whose `access.admin` allows it, can open the admin panel (`canAccessAdmin`).
- A collection without its own access rules uses Payload's default, which lets any signed-in user, of any authentication collection, read, create, update and delete. The project's `products`, `categories`, `brands` and `users` collections set none today. The translation and search-index endpoints also accept any signed-in user.
- By default, 5 failed sign-ins lock an account for 10 minutes; a session lasts 2 hours and is stored on the server, so it can be revoked; passwords are hashed with PBKDF2.
- `loginWithUsername` signs in with a username, and with `requireEmail: false` no email address is stored.
- Every authentication collection shares one session cookie, `payload-token`.

**Authentication:**

1. **Payload's authentication, in a `customers` collection:**
   - no new dependency: the lockout, sessions and hashing above come with it;
   - the admin shows customers and their orders, and Server Actions sign in through Payload's Local API;
   - every existing collection and both endpoints must first get explicit rules for editors only, with tests, or a customer could edit the catalog;
   - with one cookie, an editor and a customer cannot be signed in at once in the same browser.
2. **A dedicated library** (Better Auth or Auth.js): social sign-in and two-factor authentication that the demo does not need, a new dependency with its own tables and migrations, and a second session system beside Payload's.
3. **Hand-written** with Node's scrypt and a sessions table: no dependency, but security-sensitive code written and reviewed here, with the lockout and session revocation rebuilt.

**Sign-in identifier:**

- **a. A username, with no email address stored:** less personal data, and nothing suggests the shop will write; but most shops ask for an email address.
- **b. An email address, never verified or contacted:** familiar to visitors; but some will type their real address, or someone else's, and the shop stores it for nothing.

## Decision

Chosen:

- **Payload's authentication in a `customers` collection** (option 1), never allowed into the admin. First, explicit access rules on `products`, `categories`, `brands` and `users` and on both endpoints, for editors only, with tests proving a signed-in customer can change nothing there.
- **Sign-in with a username** (option a), no email address stored.
- **Payload's defaults** for the lockout (5 attempts, 10 minutes) and sessions (2 hours, revocable), and passwords of at least 12 characters.
- **Stored:** the username, the password hash, saved addresses and orders. "Delete my account" removes them all at once, and the daily cron deletes an account and its orders 30 days after its last sign-in, and a guest's order 30 days after it was placed.
- **A cap of 10,000 demo accounts,** past which sign-up closes with a message, so the stored data stays within Neon's free plan.
- **No password reset:** the sign-in page says so, and a forgotten password means a new demo account.

Why:

- **Payload already runs and is reviewed upstream,** so the shop adds a collection and access rules rather than a second authentication system.
- **A username stores no contact data** for a shop that never writes to anyone.
- **Deletion after 30 days** keeps the stored personal data small and short-lived.

What it costs:

- **The access rules come first:** a security change to collections that work today, proved by tests before any customer can sign up.
- **An editor and a customer** share one session cookie, so testing both at once needs two browsers or a private window.
- **A locked account** can be locked by anyone who knows its username, for 10 minutes; acceptable for a demo.
- **No reset by email,** unlike a real shop.
