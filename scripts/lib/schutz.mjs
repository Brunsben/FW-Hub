// Gemeinsamer Schutz für alle Testskripte, die Daten schreiben oder löschen.
//
// Aufruf (nach dem Laden von .env.local, vor der ersten Verbindung):
//   import { schutz } from "./lib/schutz.mjs";
//   schutz({ db: ["DATABASE_URL", "MIGRATE_DATABASE_URL"], base: BASE });
// db:   Namen der Umgebungsvariablen mit Datenbank-URLs, die das Skript tatsächlich benutzt
// base: URL des Servers (TEST_BASE), falls das Skript einen Server anspricht
// Jede genannte URL muss gesetzt und lokal sein (localhost, 127.0.0.1, ::1). Sonst endet das Skript
// mit Exit 2, bevor eine Verbindung aufgebaut wird. In der Meldung stehen nur Namen, nie Werte.
const LOKAL = ["localhost", "127.0.0.1", "[::1]", "::1"];

export function istLokal(wert) {
  try { return LOKAL.includes(new URL(wert).hostname); } catch { return false; }
}

export function schutz({ db = [], base = null } = {}) {
  const fehler = [];
  for (const name of db) {
    const wert = process.env[name];
    if (!wert) fehler.push(`${name} ist nicht gesetzt`);
    else if (!istLokal(wert)) fehler.push(`${name} zeigt nicht auf einen lokalen Host`);
  }
  if (base !== null && !istLokal(base)) fehler.push("TEST_BASE zeigt nicht auf einen lokalen Host");
  if (fehler.length) {
    console.error(`Abbruch: ${fehler.join("; ")} (erlaubt: localhost, 127.0.0.1, ::1).`);
    process.exit(2);
  }
}
