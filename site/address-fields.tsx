// The fields of an address form (issue #178), shared by the account page's
// saved addresses and, since issue #187, the checkout's delivery step. The
// browser checks each field's length, and the postal code's form, before
// the form is sent, with or without JavaScript; the routes check them again.
import type { Locale } from "../cms/locales.ts";
import type { Dictionary } from "./dictionary.ts";
import {
  ADDRESS_FIELDS,
  type AddressField,
  countryOptions,
  DEFAULT_COUNTRY,
  FIELD_RULES,
  POSTAL_CODE,
  type SavedAddress,
} from "./saved-addresses.ts";

const FIELD_LABELS: Record<AddressField, keyof Dictionary> = {
  label: "addressLabel",
  name: "addressName",
  line1: "addressLine1",
  line2: "addressLine2",
  postalCode: "addressPostalCode",
  city: "addressCity",
};

const AUTOCOMPLETE: Record<AddressField, string | undefined> = {
  label: "off",
  name: "name",
  line1: "address-line1",
  line2: "address-line2",
  postalCode: "postal-code",
  city: "address-level2",
};

/**
 * The fields of an address form, filled with an address to edit. `prefix`
 * keeps the ids of the add form and of the edit form apart.
 */
export function AddressFields({
  prefix,
  address,
  locale,
  dictionary,
  withLabel = true,
  optional = false,
}: {
  prefix: string;
  address: SavedAddress | null;
  locale: Locale;
  dictionary: Dictionary;
  /** Whether the address's own name is asked: not at checkout. */
  withLabel?: boolean;
  /** Whether no field is required: when a saved address may be chosen instead. */
  optional?: boolean;
}) {
  return (
    <>
      {ADDRESS_FIELDS.filter((name) => withLabel || name !== "label").map(
        (name) => {
          const id = `${prefix}-${name}`;
          const rule = FIELD_RULES[name];
          return (
            <p key={name}>
              <label htmlFor={id}>{dictionary[FIELD_LABELS[name]]}</label>
              <input
                id={id}
                name={name}
                type="text"
                autoComplete={AUTOCOMPLETE[name]}
                maxLength={rule.max}
                required={rule.required && !optional}
                defaultValue={address?.[name] ?? ""}
                pattern={name === "postalCode" ? POSTAL_CODE.source : undefined}
              />
            </p>
          );
        },
      )}
      <p>
        <label htmlFor={`${prefix}-country`}>{dictionary.addressCountry}</label>
        <select
          id={`${prefix}-country`}
          name="country"
          autoComplete="country"
          required={!optional}
          defaultValue={address?.country ?? DEFAULT_COUNTRY[locale]}
        >
          {countryOptions(locale).map(({ code, name }) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </p>
    </>
  );
}
