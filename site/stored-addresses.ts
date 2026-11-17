// A signed-in customer's saved addresses as Payload reads them back (issue
// #178), for the account page and, since issue #187, the checkout's
// delivery step, which offers them.
import config from "@payload-config";
import { getPayload } from "payload";
import { CUSTOMER_COLLECTION } from "../cms/collections/customers.ts";
import { isCountry, type SavedAddress } from "./saved-addresses.ts";

/** A saved address's id and fields, as Payload reads them back. */
export type StoredAddress = SavedAddress & { id: string };

/** The signed-in customer's saved addresses, in the order they were added. */
export async function storedAddresses(
  customerId: number,
): Promise<StoredAddress[]> {
  const payload = await getPayload({ config });
  const doc = await payload.findByID({
    collection: CUSTOMER_COLLECTION,
    id: customerId,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
  });
  return (doc?.addresses ?? []).flatMap((row) =>
    row.id && isCountry(row.country)
      ? [
          {
            id: row.id,
            label: row.label ?? "",
            name: row.name,
            line1: row.line1,
            line2: row.line2 ?? "",
            postalCode: row.postalCode,
            city: row.city,
            country: row.country,
          },
        ]
      : [],
  );
}
