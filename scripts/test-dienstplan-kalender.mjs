// Kalender und Rhythmus-Generator (src/lib/dienstplan/kalender.ts, Spec Abschnitt 5)
// mit Akzeptanztest 2026 (Spec 5.3): Die Regeln kommen aus der Datenbank (Seed der
// Migration 0018), die Soll-Daten sind die Termine des bisherigen Plans 2026
// (nur Daten und Kategorien, keine Namen).
//
// Aufruf: node scripts/test-dienstplan-kalender.mjs
// Env (aus .env.local): MIGRATE_DATABASE_URL (Owner, nur lesend: Regeln)
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { schutz } from "./lib/schutz.mjs";
import {
  feiertageNiedersachsen, istIsoDatum, nterWochentag, ostersonntag, plusTage, regelTreffer,
  rhythmusTreffer, tagNr, wochentag, zyklusKuerzel,
} from "../src/lib/dienstplan/kalender.ts";

const P = resolve(fileURLToPath(new URL("..", import.meta.url)));
if (existsSync(`${P}/.env.local`)) process.loadEnvFile(`${P}/.env.local`);

let fail = 0, ok = 0;
const check = (name, cond, extra = "") => {
  if (cond) { ok++; console.log(`OK   ${name}`); }
  else { fail++; console.log(`FEHLER ${name}${extra ? " — " + extra : ""}`); }
};
const gleich = (name, ist, soll) => check(name, JSON.stringify(ist) === JSON.stringify(soll), `ist ${JSON.stringify(ist)}, soll ${JSON.stringify(soll)}`);

// ── Datum ──
check("istIsoDatum", istIsoDatum("2026-02-28") && !istIsoDatum("2026-02-29") && istIsoDatum("2028-02-29") && !istIsoDatum("2026-2-1") && !istIsoDatum(null));
gleich("Wochentag (ISO)", ["2026-11-11", "2026-11-15", "2026-11-16", "1970-01-01", "1969-12-29"].map(wochentag), [3, 7, 1, 4, 1]);
gleich("plusTage über Jahres- und Schaltjahrgrenze", [plusTage("2026-12-31", 1), plusTage("2028-02-28", 1), plusTage("2026-03-01", -1)], ["2027-01-01", "2028-02-29", "2026-02-28"]);
check("tagNr und Sommerzeit", tagNr("2026-03-30") - tagNr("2026-03-28") === 2);

// ── Feiertage Niedersachsen ──
gleich("Ostersonntag", [2024, 2025, 2026, 2027].map(ostersonntag), ["2024-03-31", "2025-04-20", "2026-04-05", "2027-03-28"]);
gleich("Feiertage 2026", [...feiertageNiedersachsen(2026).keys()], [
  "2026-01-01", "2026-04-03", "2026-04-06", "2026-05-01", "2026-05-14", "2026-05-25",
  "2026-10-03", "2026-10-31", "2026-12-25", "2026-12-26"]);
// Bewegliche Feiertage 2024–2030 als feste Sollwerte (Kalenderdaten, nicht aus der Formel abgeleitet)
const BEWEGLICH = {
  2024: ["2024-03-29", "2024-04-01", "2024-05-09", "2024-05-20"],
  2025: ["2025-04-18", "2025-04-21", "2025-05-29", "2025-06-09"],
  2026: ["2026-04-03", "2026-04-06", "2026-05-14", "2026-05-25"],
  2027: ["2027-03-26", "2027-03-29", "2027-05-06", "2027-05-17"],
  2028: ["2028-04-14", "2028-04-17", "2028-05-25", "2028-06-05"],
  2029: ["2029-03-30", "2029-04-02", "2029-05-10", "2029-05-21"],
  2030: ["2030-04-19", "2030-04-22", "2030-05-30", "2030-06-10"],
};
const NAMEN = ["Karfreitag", "Ostermontag", "Christi Himmelfahrt", "Pfingstmontag"];
for (const [jahr, daten] of Object.entries(BEWEGLICH)) {
  const f = feiertageNiedersachsen(Number(jahr));
  gleich(`${jahr}: Karfreitag, Ostermontag, Himmelfahrt, Pfingstmontag`, daten.map((d) => f.get(d)), NAMEN);
  check(`${jahr}: Reformationstag 31.10.`, f.get(`${jahr}-10-31`) === "Reformationstag");
  check(`${jahr}: genau 10 Feiertage`, f.size === 10, String(f.size));
}
check("Reformationstag erst ab 2018",!feiertageNiedersachsen(2017).has("2017-10-31") && feiertageNiedersachsen(2018).get("2018-10-31") === "Reformationstag");

// ── Spec 5.1: Tabelle wochen_zyklus ──
const M = ["D", "", "D", "Z"];
gleich("Spec 5.1 Tabelle", ["2026-04-21", "2026-04-28", "2026-05-05", "2026-05-12", "2026-05-19", "2026-12-08", "2026-12-22", "2026-12-29"].map((d) => zyklusKuerzel("2026-04-28", M, d)),
  ["Z", "D", "", "D", "Z", "D", "D", "Z"]);
check("mod auch vor dem Anker", zyklusKuerzel("2026-04-28", M, "2026-04-14") === "D" && zyklusKuerzel("2026-04-28", M, "2026-04-07") === "");

// ── Spec 5.2: n-ter Wochentag ──
gleich("3. Donnerstag Feb/Mai/Aug/Nov 2026", [2, 5, 8, 11].map((m) => nterWochentag(2026, m, 4, 3)), ["2026-02-19", "2026-05-21", "2026-08-20", "2026-11-19"]);
gleich("3. Donnerstag Jan/Apr/Jul/Okt 2026", [1, 4, 7, 10].map((m) => nterWochentag(2026, m, 4, 3)), ["2026-01-15", "2026-04-16", "2026-07-16", "2026-10-15"]);
gleich("letzter Donnerstag (Dez, Feb)", [nterWochentag(2026, 12, 4, -1), nterWochentag(2026, 2, 4, -1)], ["2026-12-31", "2026-02-26"]);
check("5. Donnerstag existiert nicht immer", nterWochentag(2026, 2, 4, 5) === null && nterWochentag(2026, 4, 4, 5) === "2026-04-30");

// ── Gültigkeit und Phasenwechsel (Spec 5.2a) ──
const basis = { name: "x", typ: "wochen_zyklus", wochentag: 2, uhrzeit: "19:30:00", nterWochentag: null, monate: null, kategorieKuerzel: null, aktiv: true };
const alt = { ...basis, id: 1, ankerDatum: "2025-01-07", muster: ["D", "Z", "D", ""], gueltigAb: "2023-01-01", gueltigBis: "2025-12-31" };
const neu = { ...basis, id: 2, ankerDatum: "2026-04-28", muster: ["D", "", "D", "Z"], gueltigAb: "2026-01-01", gueltigBis: null };
const t25 = rhythmusTreffer([alt, neu], 2025), t26 = rhythmusTreffer([alt, neu], 2026);
check("Phasenwechsel: 2025 nur alte Regel, 2026 nur neue", t25.every((t) => t.regelId === 1) && t26.every((t) => t.regelId === 2) && t25.length > 0 && t26.length > 0);
check("Inaktive Regel liefert nichts", regelTreffer({ ...neu, aktiv: false }, 2026).length === 0);
check("Uhrzeit ohne Sekunden, Kürzel groß", t26[0].uhrzeit === "19:30" && regelTreffer({ ...neu, muster: ["d"] }, 2026)[0].kuerzel === "D");
check("Nur der Regel-Wochentag", t26.every((t) => wochentag(t.datum) === 2));

// ── Akzeptanztest 2026 (Spec 5.3) mit den Regeln aus der Datenbank ──
schutz({ db: ["MIGRATE_DATABASE_URL"] });
const req = createRequire(`${P}/package.json`);
const postgres = (await import(pathToFileURL(req.resolve("postgres")).href)).default;
const sql = postgres(process.env.MIGRATE_DATABASE_URL, { max: 1, onnotice: () => {} });
try {
  const regeln = (await sql`select id, name, typ, wochentag, uhrzeit::text as uhrzeit, anker_datum::text as "ankerDatum", muster,
      nter_wochentag as "nterWochentag", monate, kategorie_kuerzel as "kategorieKuerzel", gueltig_ab::text as "gueltigAb",
      gueltig_bis::text as "gueltigBis", aktiv
    from dienstplan.rhythmus_regeln where organisation_id = 1 order by id`).map((r) => ({ ...r }));
  check("Seed: drei Regeln", regeln.length === 3, String(regeln.length));
  const treffer = rhythmusTreffer(regeln, 2026);
  const nach = (k) => treffer.filter((t) => t.kuerzel === k).map((t) => t.datum.slice(5));

  // Bisheriger Plan 2026 (Excel, Blatt "Dienstplan 2026"): Dienstabende am Dienstag
  // um 19:30 (ohne Hydrantenpflege am Samstag), JHV auf Dienstabend-Slots.
  const planD = ["01-06", "01-20", "02-03", "02-17", "03-31", "04-14", "04-28", "05-12", "05-26", "06-09", "06-23",
    "07-07", "07-21", "08-04", "08-18", "09-01", "09-15", "09-29", "10-13", "10-27", "11-10", "11-24", "12-08", "12-22"];
  const planJ = ["03-03", "03-17"];
  const planZ = ["01-27", "02-24", "03-24", "04-21", "05-19", "06-16", "07-14", "08-11", "09-08", "10-06", "11-03", "12-01", "12-29"];
  const planG = ["02-19", "05-21", "08-20", "11-19"];
  const planO = ["01-23", "04-16", "07-16", "10-15"]; // Januar manuell auf Fr 23.01.

  gleich("Akzeptanz D = Dienstabende des Plans + JHV-Slots", nach("D"), [...planD, ...planJ].sort());
  gleich("Akzeptanz Z", nach("Z"), planZ);
  gleich("Akzeptanz G", nach("G"), planG);
  gleich("Akzeptanz O ab April", nach("O").filter((d) => d >= "04"), planO.filter((d) => d >= "04"));
  check("O im Januar am 3. Donnerstag (15.01.), nicht am Fr 23.01.", nach("O")[0] === "01-15");
  check("Keine weiteren Kategorien", treffer.every((t) => ["D", "Z", "G", "O"].includes(t.kuerzel)));
  check("Alle Rhythmus-Termine um 19:30", treffer.every((t) => t.uhrzeit === "19:30"));
  const feiertage = feiertageNiedersachsen(2026);
  gleich("Treffer auf Feiertagen 2026 (Hinweis, kein Ausfall)", treffer.filter((t) => feiertage.has(t.datum)).map((t) => t.datum), []);
} finally {
  await sql.end({ timeout: 5 });
}

console.log(`\n${ok} OK, ${fail} Fehler`);
process.exit(fail ? 1 : 0);
