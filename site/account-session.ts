// Who is signed in (issue #177, docs/adr/0014-customer-accounts.md): the
// customer whose Payload session the request's cookie names, checked by
// Payload against the sessions it stores, so a session signed out, expired
// or deleted with its account counts as none. A user of another collection,
// an editor, is not a customer.
import config from "@payload-config";
import { getPayload } from "payload";
import { CUSTOMER_COLLECTION } from "../cms/collections/customers.ts";

export type SignedInCustomer = { id: number; username: string; sid?: string };

/** The signed-in customer of a request's headers, or null. */
export async function signedInCustomer(
  headers: Headers,
): Promise<SignedInCustomer | null> {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers });
  if (!user || user.collection !== CUSTOMER_COLLECTION) return null;
  const { id, username, _sid } = user as unknown as {
    id: number;
    username: string;
    _sid?: string;
  };
  return { id, username, sid: _sid };
}
