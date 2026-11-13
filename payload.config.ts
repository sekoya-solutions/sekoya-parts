import path from "node:path";
import { fileURLToPath } from "node:url";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { buildConfig } from "payload";
import { Brands } from "./cms/collections/brands";
import { Categories } from "./cms/collections/categories";
import { Products } from "./cms/collections/products";
import { Users } from "./cms/collections/users";
import { locales } from "./cms/locales";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Payload's command line (scripts/payload.js) sets PAYLOAD_DATABASE_DIRECT so
// migrations use the direct connection; the site uses the pooled one
// (docs/adr/0005-database.md).
const connectionString =
  process.env.PAYLOAD_DATABASE_DIRECT === "1"
    ? process.env.DATABASE_URL_UNPOOLED
    : process.env.DATABASE_URL;

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: { baseDir: dirname },
  },
  collections: [Categories, Brands, Products, Users],
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
});
