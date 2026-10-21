import { mkdirSync } from "node:fs";
import path from "node:path";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

export { schema };

/** Both drivers expose the same query-builder API; we type against postgres-js. */
export type DB = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __myhotelDb?: Promise<DB> };

const migrationsFolder = path.join(process.cwd(), "drizzle");

async function createDb(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const client = postgres(url, { max: Number(process.env.DATABASE_POOL_MAX ?? 10) });
    return drizzle(client, { schema });
  }

  // Embedded Postgres for zero-setup local development. Migrations run on first use.
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return db as unknown as DB;
}

export function getDb(): Promise<DB> {
  if (!globalForDb.__myhotelDb) {
    globalForDb.__myhotelDb = createDb().catch((err) => {
      globalForDb.__myhotelDb = undefined;
      throw err;
    });
  }
  return globalForDb.__myhotelDb;
}

export async function runMigrations(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    await getDb(); // PGlite migrates on open
    return;
  }
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const client = postgres(url, { max: 1 });
  try {
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    await client.end();
  }
}
