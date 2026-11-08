// Wendet ausstehende Drizzle-Migrationen aus ./drizzle an.
//
// Verbindet ausschließlich über MIGRATE_DATABASE_URL (Owner-Rolle), niemals
// über DATABASE_URL (fw_app). Ersetzt `drizzle-kit migrate`, das hier Fehler
// verschluckt: Jeder Fehler führt zu Exit-Code 1.
//
// Aufruf: node scripts/migrate.mjs                (bzw. npm run db:migrate)
//         node scripts/migrate.mjs --bis 0012     nur bis einschließlich 0012
//
// Ohne --bis werden ALLE ausstehenden Migrationen in einem Lauf angewendet.
// Mit --bis <Nummer> endet der Lauf nach der Migration mit dieser Nummer
// (4 Ziffern, z. B. 0012). Das braucht man, wenn Migrationen bewusst in
// getrennten Schritten ausgerollt werden (0012 vor der App, 0013 danach).
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const url = process.env.MIGRATE_DATABASE_URL;
if (!url) {
  console.error("FEHLER: MIGRATE_DATABASE_URL ist nicht gesetzt.");
  process.exit(1);
}

// --bis <Nummer>: Journal und SQL-Dateien bis zu dieser Migration in ein
// temporäres Verzeichnis kopieren und nur dieses anwenden.
function migrationsFolder() {
  const i = process.argv.indexOf("--bis");
  if (i === -1) return { folder: "drizzle", cleanup: () => {} };
  const bis = process.argv[i + 1];
  if (!bis || !/^\d{4}$/.test(bis)) {
    console.error("FEHLER: --bis erwartet eine vierstellige Migrationsnummer, z. B. --bis 0012.");
    process.exit(1);
  }
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
  const ende = journal.entries.findIndex((e) => e.tag.startsWith(`${bis}_`));
  if (ende === -1) {
    console.error(`FEHLER: Keine Migration mit der Nummer ${bis} im Journal.`);
    process.exit(1);
  }
  const entries = journal.entries.slice(0, ende + 1);
  const dir = mkdtempSync(join(tmpdir(), "fwhub-migrate-"));
  mkdirSync(join(dir, "meta"));
  writeFileSync(join(dir, "meta", "_journal.json"), JSON.stringify({ ...journal, entries }));
  for (const e of entries) copyFileSync(join("drizzle", `${e.tag}.sql`), join(dir, `${e.tag}.sql`));
  console.log(`Begrenzt auf Migrationen bis einschließlich ${entries[ende].tag}`);
  return { folder: dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
const { folder, cleanup } = migrationsFolder();

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
  await migrate(drizzle(client), { migrationsFolder: folder });
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
  cleanup();
}
process.exit(exitCode);
