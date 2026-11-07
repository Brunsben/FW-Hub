// Wendet ausstehende Drizzle-Migrationen aus ./drizzle an.
//
// Verbindet ausschließlich über MIGRATE_DATABASE_URL (Owner-Rolle), niemals
// über DATABASE_URL (fw_app). Ersetzt `drizzle-kit migrate`, das hier Fehler
// verschluckt: Jeder Fehler führt zu Exit-Code 1.
//
// Aufruf: node scripts/migrate.mjs   (bzw. npm run db:migrate)
import { existsSync } from "node:fs";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const url = process.env.MIGRATE_DATABASE_URL;
if (!url) {
  console.error("FEHLER: MIGRATE_DATABASE_URL ist nicht gesetzt.");
  process.exit(1);
}

const client = postgres(url, { max: 1, onnotice: () => {} });

async function countApplied() {
  const [{ exists }] = await client`
    select to_regclass('drizzle.__drizzle_migrations') is not null as exists`;
  if (!exists) return 0;
  const [{ n }] = await client`
    select count(*)::int as n from drizzle.__drizzle_migrations`;
  return n;
}

let exitCode = 0;
try {
  const before = await countApplied();
  await migrate(drizzle(client), { migrationsFolder: "drizzle" });
  const after = await countApplied();
  console.log(`Migrationen eingetragen: ${before} -> ${after}`);
} catch (e) {
  console.error("Migration fehlgeschlagen:", e instanceof Error ? e.message : e);
  if (e && typeof e === "object" && "cause" in e && e.cause) {
    console.error("Ursache:", e.cause instanceof Error ? e.cause.message : e.cause);
  }
  exitCode = 1;
} finally {
  await client.end({ timeout: 5 });
}
process.exit(exitCode);
