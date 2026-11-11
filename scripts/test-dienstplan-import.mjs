// Dienstplan-Import Ende zu Ende gegen die lokale Datenbank (ohne Dev-Server).
// Erzeugt eine Excel-Datei mit erfundenen Daten (Jahre 2091/2092, Namen mit
// Zeitstempel), ruft scripts/dienstplan-import.mjs auf (läuft als fw_app über
// DATABASE_URL, RLS greift) und prüft das Ergebnis als Owner. Räumt nur die
// eigenen Daten über Präfix bzw. gemerkte IDs auf.
//
// Aufruf: node scripts/test-dienstplan-import.mjs
// Env (aus .env.local): DATABASE_URL (fw_app, für das Skript), MIGRATE_DATABASE_URL (Owner)
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { schutz } from "./lib/schutz.mjs";

const P = resolve(fileURLToPath(new URL("..", import.meta.url)));
if (existsSync(`${P}/.env.local`)) process.loadEnvFile(`${P}/.env.local`);
schutz({ db: ["DATABASE_URL", "MIGRATE_DATABASE_URL"] });
const req = createRequire(`${P}/package.json`);
const postgres = (await import(pathToFileURL(req.resolve("postgres")).href)).default;
const ExcelJS = (await import(pathToFileURL(req.resolve("exceljs")).href)).default;
const owner = postgres(process.env.MIGRATE_DATABASE_URL, { max: 1, onnotice: () => {} });

let fail = 0, ok = 0;
const check = (name, cond, extra = "") => {
  if (cond) { ok++; console.log(`OK   ${name}${extra ? " — " + extra : ""}`); }
  else { fail++; console.log(`FEHLER ${name}${extra ? " — " + extra : ""}`); }
};

const S = `Dpi${Date.now().toString(36)}`; // Präfix für Namen, Themen, Organisationen
const JAHRE = [2091, 2092];
const tmp = mkdtempSync(join(tmpdir(), "dp-import-"));
const datei = join(tmp, "plan.xlsx");
const zuordnung = join(tmp, "zuordnung.json");
const ids = { kam: [] };
// Ausgleichsliste: Der Import füllt sie nur, wenn sie leer ist. Darum vorher
// sichern und leeren, am Ende wiederherstellen.
let ausgleichVorher = [];

function lauf(args, env = {}) {
  const r = spawnSync(process.execPath, [join(P, "scripts", "dienstplan-import.mjs"), "--datei", datei, "--bericht", tmp, "--zuordnung", zuordnung, ...args], {
    env: { ...process.env, ...env }, encoding: "utf8",
  });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
const zaehle = async () => (await owner`select count(*)::int as n from dienstplan.plaene where jahr in ${owner(JAHRE)}`)[0].n;
const bericht = () => {
  const f = readdirSync(tmp).find((x) => x.startsWith("klaerung-") && x.endsWith(".csv"));
  return f ? readFileSync(join(tmp, f), "utf8") : "";
};

async function excel() {
  const wb = new ExcelJS.Workbook();
  const zeit = (h, m) => new Date(Date.UTC(1899, 11, 30, h, m));
  const tag = (j, mo, d) => new Date(Date.UTC(j, mo - 1, d));
  const blatt = (jahr, zeilen) => {
    const ws = wb.addWorksheet(`Dienstplan ${jahr}`);
    ws.addRow(["Datum", "Typ", "Uhrzeit ", "Thema", "Küchendienst", "Ausbilder", "Option wg. Umbau"]);
    for (const z of zeilen) ws.addRow(z);
  };
  blatt(2091, [
    [tag(2091, 1, 9), "D", zeit(19, 30), `${S} Knoten / ${S} Leitern`, null, `${S}Alpha, J. / ${S}Beta`],
    [tag(2091, 1, 16), "z", zeit(19, 30), "Zwischendienst"],
    [tag(2091, 1, 23), "D", zeit(19, 30), `${S} Knoten / ${S} Leitern`, null, `OF ${S}`, "Halle Nord"],
    [tag(2091, 1, 30), "D", zeit(19, 30), `${S} knoten-übung`, null, `${S}Gamma`],
    [tag(2091, 2, 6), "g", zeit(19, 30), "Gruppenführerrunde", null, "GF"],
    [tag(2091, 12, 24), "F", null, "Heiligabend"],
  ]);
  blatt(2092, [
    [tag(2092, 1, 8), "D", zeit(19, 0), `${S} Knoten / ${S} Leitern`, null, `${S}Alpha, J. / n.n.`],
    [tag(2092, 1, 15), "K", zeit(14, 0), "Grillen", null, `${S}Omega / ${S}Platz`],
  ]);
  const gf = wb.addWorksheet("Gruppenführer");
  gf.addRow([]); gf.addRow([null, null, "GF", "Anzahl"]);
  gf.addRow([null, null, `${S}Alpha, J`]); gf.addRow([null, null, `${S}Beta`]);
  await wb.xlsx.writeFile(datei);
}

try {
  ausgleichVorher = [...await owner`select organisation_id, kamerad_id from dienstplan.ausgleich_personen`];
  await owner`delete from dienstplan.ausgleich_personen`;
  await excel();
  writeFileSync(zuordnung, "{}");
  // Kameraden (Owner): Alpha eindeutig, Beta eindeutig, Gamma doppelt (mehrdeutig), Omega fehlt
  for (const [name, vorname] of [[`${S}Alpha`, "Jana"], [`${S}Beta`, "Ines"], [`${S}Gamma`, "Anna"], [`${S}Gamma`, "Tom"], [`${S}Importeur`, "Ivo"]]) {
    const [k] = await owner`insert into core.kameraden (name, vorname) values (${name}, ${vorname}) returning id`;
    ids.kam.push(k.id);
  }
  const [alpha, beta, gamma1, gamma2, importeur] = ids.kam;
  const vorher = await zaehle();

  // ── Schutz ──
  let r = lauf(["--testdaten", "--dry-run"], { DATABASE_URL: "postgres://x:y@db.example.org:5432/fwhub" });
  check("--testdaten gegen fremden Host → Exit 2, auch mit --dry-run", r.code === 2 && r.out.includes("nur erlaubt, wenn DATABASE_URL auf localhost"), String(r.code));
  check("Meldung enthält keine URL", !r.out.includes("example.org"));
  r = lauf([]);
  check("Ohne --dry-run und ohne --als → Exit 2", r.code === 2 && r.out.includes("--als"), String(r.code));
  r = lauf(["--als", String(importeur), "--jahre", "2093"]);
  check("Jahr ohne Blatt → Exit 2", r.code === 2 && r.out.includes("Dienstplan 2093"), String(r.code));

  // ── Probelauf ──
  r = lauf(["--dry-run"]);
  check("Probelauf → Exit 0", r.code === 0, r.out.slice(-300));
  check("Probelauf schreibt nichts", (await zaehle()) === vorher);
  const b1 = bericht();
  check("Klärungsbericht liegt im Bericht-Ordner", b1.startsWith("﻿art;status;schreibweise"));
  check("Bericht: Gamma mehrdeutig mit beiden Kandidaten", new RegExp(`person;mehrdeutig;${S}Gamma;`).test(b1) && b1.includes(`${gamma1}: ${S}Gamma, Anna`) && b1.includes(`${gamma2}: ${S}Gamma, Tom`));
  check("Bericht: Omega unbekannt", new RegExp(`person;unbekannt;${S}Omega;`).test(b1));
  check("Bericht: Alpha zugeordnet, Schreibvarianten zusammengefasst", b1.includes(`person;zugeordnet;${S}Alpha, J. (auch: ${S}Alpha, J)`));
  check("Bericht: Titel mit \"/\" ohne Block bleibt ein Thema, mit Blockvorschlag", b1.includes(`block;vorschlag;${S} Knoten / ${S} Leitern;3`) && b1.includes(`thema;katalog;${S} Knoten / ${S} Leitern;3`));
  check("Konsole nennt offene Klärungen", r.out.includes("Import wäre so NICHT möglich: 3 offene Klärung(en)"));
  const vorlage = JSON.parse(readFileSync(join(tmp, readdirSync(tmp).find((x) => x.startsWith("zuordnung-vorlage-"))), "utf8"));
  check("Vorlage enthält offene Personen mit null", vorlage.personen[`${S}Gamma`] === null && vorlage.personen[`${S}Omega`] === null);

  // ── Import mit offenen Klärungen bricht ab ──
  r = lauf(["--als", String(importeur)]);
  check("Import mit offenen Klärungen → Exit 1, nichts geschrieben", r.code === 1 && (await zaehle()) === vorher && r.out.includes("nichts importiert"), String(r.code));

  // ── Zuordnung, dann Import ──
  writeFileSync(zuordnung, JSON.stringify({
    personen: { [`${S}Gamma`]: gamma2, [`${S}omega`]: { extern: { organisation: `${S} Verein`, name: "Frau Omega" } }, [`${S}Platz`]: "ort" },
    themen: { [`${S} knoten-übung`]: `${S} Knoten` },
    bloecke: [[`${S} Knoten`, `${S} Leitern`]],
  }));
  r = lauf(["--als", String(importeur)]);
  check("Import → Exit 0", r.code === 0, r.out.slice(-400));
  const plaene = await owner`select id, jahr, status, freigegeben_von from dienstplan.plaene where jahr in ${owner(JAHRE)} order by jahr`;
  check("Zwei freigegebene Pläne, freigegeben_von = --als", plaene.length === 2 && plaene.every((p) => p.status === "freigegeben" && p.freigegeben_von === importeur));
  const termine = await owner`select t.datum::text, k.kuerzel, t.uhrzeit::text, t.ausgefallen, t.ort, t.bemerkung, t.quelle
    from dienstplan.termine t join dienstplan.kategorien k on k.id = t.kategorie_id join dienstplan.plaene p on p.id = t.plan_id
    where p.jahr in ${owner(JAHRE)} order by t.datum`;
  check("8 Termine übernommen", termine.length === 8, String(termine.length));
  const tm = (d) => termine.find((t) => t.datum === d);
  check("Typ klein geschrieben → Z/G", tm("2091-01-16")?.kuerzel === "Z" && tm("2091-02-06")?.kuerzel === "G");
  check("F → D, ausgefallen, Grund in bemerkung", tm("2091-12-24")?.kuerzel === "D" && tm("2091-12-24").ausgefallen && tm("2091-12-24").bemerkung === "Heiligabend");
  check("Uhrzeit und Ort übernommen", tm("2092-01-08")?.uhrzeit === "19:00:00" && tm("2091-01-23")?.ort === "Halle Nord");
  check("Quelle manuell", termine.every((t) => t.quelle === "manuell"));

  const tt = await owner`select t.datum::text, tt.position, th.titel, tt.titel_freitext, tt.aus_block_id, b.name as block
    from dienstplan.termin_themen tt join dienstplan.termine t on t.id = tt.termin_id join dienstplan.plaene p on p.id = t.plan_id
    left join dienstplan.themen th on th.id = tt.thema_id left join dienstplan.themenbloecke b on b.id = tt.aus_block_id
    where p.jahr in ${owner(JAHRE)} order by t.datum, tt.position`;
  const am = (d) => tt.filter((x) => x.datum === d);
  check("Themen positionsgleich aus dem Katalog", JSON.stringify(am("2091-01-09").map((x) => [x.position, x.titel])) === JSON.stringify([[1, `${S} Knoten`], [2, `${S} Leitern`]]));
  check("Bestätigter Block an den drei Terminen", tt.filter((x) => x.block === `${S} Knoten / ${S} Leitern`).length === 6);
  check("Zusammengeführtes Thema verweist auf den Katalogeintrag", am("2091-01-30")[0]?.titel === `${S} Knoten`);
  check("Zwischendienst ohne Thema, G und K als Freitext", am("2091-01-16").length === 0 && am("2091-02-06")[0]?.titel_freitext === "Gruppenführerrunde" && am("2092-01-15")[0]?.titel_freitext === "Grillen");
  const katalog = await owner`select titel from dienstplan.themen where titel like ${S + "%"} order by titel`;
  check("Katalog: zwei Themen, keine Variante", JSON.stringify(katalog.map((x) => x.titel)) === JSON.stringify([`${S} Knoten`, `${S} Leitern`]));

  const v = await owner`select t.datum::text, tt.position as tp, v.position, v.kamerad_id, v.platzhalter, e.organisation, e.name
    from dienstplan.termin_verantwortliche v join dienstplan.termin_themen tt on tt.id = v.termin_thema_id
    join dienstplan.termine t on t.id = tt.termin_id join dienstplan.plaene p on p.id = t.plan_id
    left join dienstplan.externe_personen e on e.id = v.externe_person_id
    where p.jahr in ${owner(JAHRE)} order by t.datum, tt.position, v.position`;
  const vam = (d) => v.filter((x) => x.datum === d);
  check("Verantwortliche positionsgleich", JSON.stringify(vam("2091-01-09").map((x) => [x.tp, x.kamerad_id])) === JSON.stringify([[1, alpha], [2, beta]]));
  check("Organisation als externe Person an jedem Thema", vam("2091-01-23").length === 2 && vam("2091-01-23").every((x) => x.organisation === `OF ${S}` && x.name === null));
  check("Mehrdeutiger Name über Zuordnung", vam("2091-01-30")[0]?.kamerad_id === gamma2);
  check("GF → alle_gf, n.n. → offen", vam("2091-02-06")[0]?.platzhalter === "alle_gf" && vam("2092-01-08")[1]?.platzhalter === "offen");
  check("Externe Person aus der Zuordnung", vam("2092-01-15")[0]?.organisation === `${S} Verein` && vam("2092-01-15")[0]?.name === "Frau Omega");
  check("Zuordnung \"ort\": Eintrag steht im Ort, nicht unter den Verantwortlichen", tm("2092-01-15")?.ort === `${S}Platz` && vam("2092-01-15").length === 1);
  const extern = await owner`select count(*)::int as n from dienstplan.externe_personen where organisation in (${`OF ${S}`}, ${`${S} Verein`})`;
  check("Externe Personen nur einmal angelegt", extern[0].n === 2, String(extern[0].n));
  const ausgleich = await owner`select kamerad_id from dienstplan.ausgleich_personen where kamerad_id in ${owner(ids.kam)} order by kamerad_id`;
  check("Ausgleichspersonen aus dem Blatt Gruppenführer (Liste war leer)", JSON.stringify(ausgleich.map((x) => x.kamerad_id)) === JSON.stringify([alpha, beta]));
  const neueKam = await owner`select count(*)::int as n from core.kameraden where name like ${S + "%"}`;
  check("Regulärer Import legt keine Kameraden an", neueKam[0].n === ids.kam.length);

  // ── Wiederholen ──
  r = lauf(["--als", String(importeur)]);
  check("Erneuter Import ohne --ersetzen → Exit 1", r.code === 1 && r.out.includes("Plan existiert bereits"), String(r.code));
  await owner`delete from dienstplan.ausgleich_personen where kamerad_id = ${beta}`; // "gepflegte" Liste
  r = lauf(["--als", String(importeur), "--ersetzen"]);
  const ausgleich2 = await owner`select kamerad_id from dienstplan.ausgleich_personen where kamerad_id in ${owner(ids.kam)}`;
  check("Gepflegte Ausgleichsliste wird nicht überschrieben (Vorschlag nur bei leerer Liste)",
    ausgleich2.length === 1 && ausgleich2[0].kamerad_id === alpha && r.out.includes("Vorschlag aus dem Excel nicht übernommen"), r.out.slice(-300));
  const nach = await owner`select count(*)::int as n from dienstplan.termine t join dienstplan.plaene p on p.id = t.plan_id where p.jahr in ${owner(JAHRE)}`;
  const kat2 = await owner`select count(*)::int as n from dienstplan.themen where titel like ${S + "%"}`;
  const bl2 = await owner`select count(*)::int as n from dienstplan.themenbloecke where name like ${S + "%"}`;
  check("Mit --ersetzen: gleiche Terminzahl, Katalog und Blöcke nicht doppelt", r.code === 0 && nach[0].n === 8 && kat2[0].n === 2 && bl2[0].n === 1, `${r.code} ${nach[0].n} ${kat2[0].n} ${bl2[0].n}`);

  // ── Testdaten-Modus (lokal) ──
  writeFileSync(zuordnung, "{}");
  r = lauf(["--als", String(importeur), "--ersetzen", "--testdaten"]);
  const alleTest = await owner`select id, name, vorname, personalnummer from core.kameraden where name like ${S + "%"} and personalnummer like 'TEST-DP-%'`;
  ids.kam.push(...alleTest.map((x) => x.id));
  const test = alleTest.filter((x) => x.name === S + "Omega");
  check("Testdaten: fehlender Kamerad angelegt, markiert mit TEST-DP-", r.code === 0 && test.length === 1 && test[0].personalnummer.startsWith("TEST-DP-") && test[0].vorname === "Test", `${r.code} ${JSON.stringify(test)}`);
  check("Testdaten: mehrdeutiger Name → erster Kandidat", (await owner`select v.kamerad_id from dienstplan.termin_verantwortliche v join dienstplan.termin_themen tt on tt.id = v.termin_thema_id join dienstplan.termine t on t.id = tt.termin_id where t.datum = '2091-01-30'`)[0]?.kamerad_id === gamma1);
} finally {
  try {
    await owner`delete from dienstplan.plaene where jahr in ${owner(JAHRE)}`;
    await owner`delete from dienstplan.themenbloecke where name like ${S + "%"}`;
    await owner`delete from dienstplan.themen where titel like ${S + "%"}`;
    await owner`delete from dienstplan.externe_personen where organisation in (${`OF ${S}`}, ${`${S} Verein`})`;
    if (ids.kam.length) {
      await owner`delete from dienstplan.ausgleich_personen where kamerad_id in ${owner(ids.kam)}`;
      await owner`delete from core.mitglieder_audit where kamerad_id in ${owner(ids.kam)}`;
      await owner`delete from core.kameraden where id in ${owner(ids.kam)}`;
    }
    await owner`delete from dienstplan.ausgleich_personen`;
    for (const a of ausgleichVorher) {
      await owner`insert into dienstplan.ausgleich_personen (organisation_id, kamerad_id) values (${a.organisation_id}, ${a.kamerad_id}) on conflict do nothing`;
    }
    const [{ n: ag }] = await owner`select count(*)::int n from dienstplan.ausgleich_personen`;
    if (ag !== ausgleichVorher.length) { console.log(`AUFRÄUMEN: Ausgleichsliste ${ag} statt ${ausgleichVorher.length}`); fail++; }
    const rest = await owner`select count(*)::int as n from core.kameraden where name like ${S + "%"}`;
    if (rest[0].n) { console.log(`AUFRÄUMEN: ${rest[0].n} Kameraden mit Präfix übrig`); fail++; }
  } catch (e) { console.log("AUFRÄUMEN FEHLGESCHLAGEN:", e.message); fail++; }
  await owner.end({ timeout: 5 });
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`\n${ok} OK, ${fail} Fehler`);
process.exit(fail ? 1 : 0);
