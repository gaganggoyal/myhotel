import { runMigrations } from "../src/db";

runMigrations()
  .then(() => {
    console.log(`Migrations applied (${process.env.DATABASE_URL ? "Postgres" : "embedded PGlite in .data/pglite"}).`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
