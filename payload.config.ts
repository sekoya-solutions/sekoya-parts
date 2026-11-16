import path from "node:path";
import { fileURLToPath } from "node:url";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { buildConfig } from "payload";
import { closePayloadCollections } from "./cms/access";
import { accountPurgeEndpoint } from "./cms/accounts/endpoint";
import { Brands } from "./cms/collections/brands";
import { Categories } from "./cms/collections/categories";
import { Customers } from "./cms/collections/customers";
import { Products } from "./cms/collections/products";
import { PromotionCodes } from "./cms/collections/promotion-codes";
import { Promotions } from "./cms/collections/promotions";
import { Users } from "./cms/collections/users";
import { ShopSettings } from "./cms/globals/shop-settings";
import { locales } from "./cms/locales";
import { salesRunEndpoint } from "./cms/sales/endpoint";
import { searchIndexRunEndpoint } from "./cms/search-index/endpoint";
import { translationRunEndpoint } from "./cms/translation/endpoint";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Payload's command line (scripts/payload.js) sets PAYLOAD_DATABASE_DIRECT so
// migrations use the direct connection; the site uses the pooled one
// (docs/adr/0005-database.md).
const connectionString =
  process.env.PAYLOAD_DATABASE_DIRECT === "1"
    ? process.env.DATABASE_URL_UNPOOLED
    : process.env.DATABASE_URL;

// Payload's own collections get the editor check too (issue #176).
export default closePayloadCollections(
  buildConfig({
    admin: {
      user: Users.slug,
      importMap: { baseDir: dirname },
    },
    collections: [
      Categories,
      Brands,
      Products,
      Promotions,
      PromotionCodes,
      Users,
      // The shop's demo accounts, never allowed into the admin (issue #177).
      Customers,
    ],
    // The cart's delivery values (issue #169).
    globals: [ShopSettings],
    // The translation sweep (issue #104), the search index run (issue #115)
    // the sale rotation (issue #151) and the demo accounts' purge (issue
    // #177), each run by a daily cron or a signed-in editor.
    endpoints: [
      translationRunEndpoint,
      searchIndexRunEndpoint,
      salesRunEndpoint,
      accountPurgeEndpoint,
    ],
    // The admin uses REST; no GraphQL endpoint is exposed.
    graphQL: { disable: true },
    localization: {
      locales: [...locales],
      defaultLocale: "fr",
    },
    secret: process.env.PAYLOAD_SECRET ?? "",
    // Payload sends anonymous usage data to telemetry.payloadcms.com unless this
    // is false; the site sends no data to third parties (issue #88).
    telemetry: false,
    typescript: {
      outputFile: path.resolve(dirname, "cms/payload-types.ts"),
    },
    db: postgresAdapter({
      pool: { connectionString },
      // The schema comes only from committed migrations (issue #45).
      push: false,
      migrationDir: path.resolve(dirname, "migrations"),
      // The Neon database already exists; Payload must not try to create one.
      disableCreateDatabase: true,
    }),
  }),
);
