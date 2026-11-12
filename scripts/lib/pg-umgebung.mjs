// Hilfsskript für scripts/db-backup.sh und scripts/db-restore.sh: liest die
// Datenbank-URL (Variable BACKUP_DATABASE_URL, sonst MIGRATE_DATABASE_URL; aus
// der Umgebung oder .env.local) und gibt sie als PG*-Variablen für `eval` aus.
// Das Passwort geht so nur über die Umgebung an pg_dump/pg_restore, nie über die
// Befehlszeile. Nur lokale Hosts (wie scripts/lib/schutz.mjs), sonst Exit 2.
// Ausgabe nie anzeigen lassen, nur mit eval verwenden.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { istLokal } from "./schutz.mjs";

const P = resolve(fileURLToPath(new URL("../..", import.meta.url)));
if (existsSync(`${P}/.env.local`)) process.loadEnvFile(`${P}/.env.local`);
const name = process.env.BACKUP_DATABASE_URL ? "BACKUP_DATABASE_URL" : "MIGRATE_DATABASE_URL";
const wert = process.env[name];
if (!wert) { console.error(`Abbruch: weder BACKUP_DATABASE_URL noch MIGRATE_DATABASE_URL gesetzt.`); process.exit(2); }
if (!istLokal(wert)) { console.error(`Abbruch: ${name} zeigt nicht auf einen lokalen Host. Auf dem Server scripts/server-backup.sh verwenden.`); process.exit(2); }
const u = new URL(wert);
const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const zeilen = {
  PGHOST: u.hostname.replace(/^\[|\]$/g, ""),
  PGPORT: u.port || "5432",
  PGUSER: decodeURIComponent(u.username),
  PGPASSWORD: decodeURIComponent(u.password),
  PGDATABASE: decodeURIComponent(u.pathname.replace(/^\//, "")),
};
for (const [k, v] of Object.entries(zeilen)) console.log(`export ${k}=${q(v)}`);
