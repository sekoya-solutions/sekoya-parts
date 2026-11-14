// Loads the generated catalog into PostgreSQL with COPY, over the direct
// (unpooled) connection (docs/adr/0005-database.md, docs/adr/0007-catalog-data-model.md).
//
// Usage: npm run generate -- [--scale small|full] [--seed 1] [--replace]
//
// Everything happens in one transaction: if any step fails or the run is
// interrupted, the database keeps its previous content. Without --replace the
// script refuses to touch a database whose catalog already holds rows. Payload's
// users, sessions and preferences are never touched.
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { parseArgs } from "node:util";
import pg from "pg";
import { from as copyFrom } from "pg-copy-streams";
import {
  brandRows,
  categories,
  categoryLocaleRows,
  compatibilityRows,
  isScaleName,
  modelRows,
  productLocaleRows,
  productRows,
} from "../catalog/generator.ts";
import { catalogTables } from "../catalog/tables.ts";

type Value = string | number | boolean | null;

// Tables whose ids come from a serial sequence that Payload uses for new rows.
const serialTables = [
  "categories",
  "categories_locales",
  "brands",
  "products",
  "products_locales",
] as const;

/** One field in COPY's text format. */
function field(value: Value): string {
  if (value === null) return "\\N";
  if (typeof value === "boolean") return value ? "t" : "f";
  if (typeof value === "number") return String(value);
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\t/g, "\\t")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

/** Joins rows into COPY text, in chunks of about 64 KiB, counting them. */
function* chunks(
  rows: Iterable<readonly Value[]>,
  counter: { rows: number },
): Generator<string> {
  let buffer = "";
  for (const row of rows) {
    buffer += `${row.map(field).join("\t")}\n`;
    counter.rows++;
    if (buffer.length >= 65_536) {
      yield buffer;
      buffer = "";
    }
  }
  if (buffer) yield buffer;
}

async function copy(
  client: pg.Client,
  table: string,
  columns: readonly string[],
  rows: Iterable<readonly Value[]>,
): Promise<void> {
  const started = performance.now();
  const counter = { rows: 0 };
  const sql = `COPY "${table}" (${columns.map((c) => `"${c}"`).join(", ")}) FROM STDIN`;
  // pipeline waits for COPY to finish on the server, applies back-pressure,
  // and rejects if either side fails.
  await pipeline(
    Readable.from(chunks(rows, counter)),
    client.query(copyFrom(sql)),
  );
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(
    `  ${table}: ${counter.rows.toLocaleString("en")} rows in ${seconds} s`,
  );
}

function parseOptions() {
  const { values } = parseArgs({
    options: {
      scale: { type: "string", default: "small" },
      seed: { type: "string", default: "1" },
      replace: { type: "boolean", default: false },
    },
  });
  const scale = values.scale;
  if (!isScaleName(scale)) {
    throw new Error(`Unknown scale "${scale}": use small or full.`);
  }
  const seed = Number(values.seed);
  if (!Number.isSafeInteger(seed) || seed < 0) {
    throw new Error(
      `The seed must be a non-negative integer, not "${values.seed}".`,
    );
  }
  return { scale, seed, replace: values.replace };
}

async function main(): Promise<void> {
  const { scale, seed, replace } = parseOptions();
  const connectionString = process.env.DATABASE_URL_UNPOOLED;
  if (!connectionString) {
    throw new Error("DATABASE_URL_UNPOOLED must be set (see .env.example).");
  }
  // The host only, so the output never shows credentials.
  console.log(
    `Generating the ${scale} catalog, seed ${seed}, into ${new URL(connectionString).host}`,
  );

  const started = performance.now();
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query("BEGIN");
    try {
      // Blocks other writers until COMMIT, so the emptiness check stays true.
      await client.query(
        `LOCK TABLE ${catalogTables.map((t) => `"${t}"`).join(", ")} IN EXCLUSIVE MODE`,
      );
      const { rows } = await client.query<{ filled: boolean }>(
        `SELECT ${catalogTables.map((t) => `EXISTS (SELECT 1 FROM "${t}")`).join(" OR ")} AS filled`,
      );
      if (rows[0]?.filled) {
        if (!replace) {
          throw new Error(
            "The catalog already holds rows. Pass --replace to delete and regenerate it.",
          );
        }
        // CASCADE also empties payload_locked_documents_rels, which points at
        // catalog documents; locks on catalog documents are meaningless after a reload.
        await client.query(
          `TRUNCATE ${catalogTables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`,
        );
        console.log("  previous catalog deleted");
      }
      // The search indices held the previous catalog: forgetting their state
      // makes the next reconcile read each index and send every record again
      // (cms/search-index/sync.ts).
      await client.query("DELETE FROM search_index_state");
      await client.query("DELETE FROM search_index_queue");

      await copy(
        client,
        "categories",
        ["id"],
        categories().map((c) => [c.id]),
      );
      await copy(
        client,
        "categories_locales",
        ["name", "slug", "_locale", "_parent_id"],
        categoryLocaleRows(),
      );
      await copy(
        client,
        "brands",
        ["id", "name", "slug"],
        brandRows(seed, scale),
      );
      await copy(
        client,
        "products",
        [
          "id",
          "reference",
          "brand_id",
          "category_id",
          "price_cents",
          "showcase",
        ],
        productRows(seed, scale),
      );
      await copy(
        client,
        "products_locales",
        ["name", "description", "_locale", "_parent_id"],
        productLocaleRows(scale),
      );
      await copy(
        client,
        "appliance_models",
        ["id", "brand_id", "reference", "appliance_type"],
        modelRows(seed, scale),
      );
      await copy(
        client,
        "compatibility",
        ["product_id", "rank", "model_id"],
        compatibilityRows(seed, scale),
      );

      // Rows were loaded with explicit ids: move each sequence past them, so
      // documents created later in Payload get free ids.
      for (const table of serialTables) {
        await client.query(
          `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), COALESCE(MAX(id), 0) + 1, false) FROM "${table}"`,
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {
        // The connection is gone: the server has already aborted the transaction.
      });
      throw error;
    }

    // Fresh statistics so the planner uses the new indexes well.
    await client.query(
      `ANALYZE ${catalogTables.map((t) => `"${t}"`).join(", ")}`,
    );

    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    const size = await client.query<{ catalog: string; database: string }>(
      `SELECT pg_size_pretty(${catalogTables
        .map((t) => `pg_total_relation_size('"${t}"')`)
        .join(" + ")}) AS catalog,
        pg_size_pretty(pg_database_size(current_database())) AS database`,
    );
    console.log(`Done in ${seconds} s.`);
    console.log(
      `Catalog tables with indexes: ${size.rows[0]?.catalog}; whole database: ${size.rows[0]?.database}.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
