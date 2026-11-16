// Who may use Payload's API (docs/adr/0014-customer-accounts.md, issue #176).
// Without its own rules, a Payload collection lets any signed-in user, of any
// authentication collection, read, create, update and delete. Customers will
// sign in to their own collection, so every rule here names editors: signed-in
// users of `users`, the editors' and the automation user's collection.
//
// The site reads Payload through its Local API, which skips these rules unless
// a call passes `overrideAccess: false`, so visitors see no change.
import type { Access } from "payload";

/** The editors' authentication collection, the one the admin uses. */
export const EDITOR_COLLECTION = "users";

/**
 * Whether a request's user is an editor. Payload sets `collection` on the
 * user it authenticates, by session or by API key, to its collection's slug.
 */
export function isEditor(user: unknown): boolean {
  return (
    typeof user === "object" &&
    user !== null &&
    (user as { collection?: unknown }).collection === EDITOR_COLLECTION
  );
}

/** An access rule allowing editors only. */
export const editorsOnly: Access = ({ req }) => isEditor(req.user);

/** A collection's rules: every operation for editors only. */
export const editorCollectionAccess = {
  create: editorsOnly,
  read: editorsOnly,
  update: editorsOnly,
  delete: editorsOnly,
  unlock: editorsOnly,
};

/** A global's rules: reading and saving for editors only. */
export const editorGlobalAccess = {
  read: editorsOnly,
  update: editorsOnly,
};
