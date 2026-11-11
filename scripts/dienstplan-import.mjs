// Einmaliger Import der bisherigen Excel-Dienstpläne (Spec Abschnitt 10, Phase 4).
//
// Aufruf:
//   node scripts/dienstplan-import.mjs --dry-run                  Probelauf, schreibt nichts
//   node scripts/dienstplan-import.mjs --als <kameradId>          Import
// Optionen:
//   --datei <pfad>       Excel-Datei (Standard: data/import/Dienstplan 2026.xlsx)
//   --jahre <liste>      z. B. 2026 oder 2025,2026 oder 2023-2026 (Standard: alle Blätter "Dienstplan JJJJ")
//   --zuordnung <pfad>   manuelle Zuordnung (Standard: data/import/zuordnung.json, falls vorhanden)
//   --bericht <ordner>   Ziel für Klärungsbericht und Vorlage (Standard: data/import)
//   --als <kameradId>    wer importiert (Pflicht ohne --dry-run): freigegeben_von, Änderungsprotokoll
//   --ersetzen           vorhandene Pläne dieser Jahre vorher löschen (sonst Abbruch)
//   --testdaten          NUR lokal: fehlende Kameraden als Testdaten anlegen (personalnummer TEST-DP-…),
//                        mehrdeutige Namen dem ersten Kandidaten zuordnen
//
// Grundsätze (Vorgaben vom 11.11.2026):
// - Der reguläre Import legt NIE Kameraden an. Nicht zuordenbare Namen stehen im
//   Klärungsbericht (CSV unter data/import/, dazu Konsole) und blockieren den Import,
//   bis sie in der Zuordnungsdatei stehen oder in der Mitgliederverwaltung (z. B.
//   Spitzname) geklärt sind.
// - --testdaten bricht ab, wenn DATABASE_URL nicht auf localhost zeigt, egal welche
//   anderen Optionen gesetzt sind.
// - Läuft als fw_app (DATABASE_URL) im Dienstplan-Scope mit Rolle Admin, wie
//   withDienstplanScope (src/lib/db/scoped.ts). RLS greift. Alles in EINER
//   Transaktion; bei einem Fehler wird nichts geschrieben. --dry-run nutzt eine
//   READ-ONLY-Transaktion.
// - data/import/ ist in .gitignore: Excel, Bericht und Zuordnung enthalten Personendaten.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { istLokal } from "./lib/schutz.mjs";
import {
  analysiere, berichtZeilen, csv, findeKameraden, norm, vergleich, zuordnungsVorlage,
} from "./lib/dienstplan-import.mjs";

const P = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ORGANISATION_ID = 1; // DIENSTPLAN_ORGANISATION_ID (src/lib/dienstplan/auth.ts)

// ── Argumente ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const opt = { datei: join(P, "data", "import", "Dienstplan 2026.xlsx"), bericht: join(P, "data", "import"), zuordnung: null, jahre: null, als: null, dryRun: false, ersetzen: false, testdaten: false };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  const wert = () => { const v = args[++i]; if (v == null) { console.error(`${a} braucht einen Wert`); process.exit(2); } return v; };
  if (a === "--dry-run") opt.dryRun = true;
  else if (a === "--ersetzen") opt.ersetzen = true;
  else if (a === "--testdaten") opt.testdaten = true;
  else if (a === "--datei") opt.datei = resolve(wert());
  else if (a === "--bericht") opt.bericht = resolve(wert());
  else if (a === "--zuordnung") opt.zuordnung = resolve(wert());
  else if (a === "--als") opt.als = Number(wert());
  else if (a === "--jahre") opt.jahre = jahreAus(wert());
  else if (a === "--hilfe" || a === "-h") { console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).slice(0, 15).map((l) => l.slice(3)).join("\n")); process.exit(0); }
  else { console.error(`Unbekannte Option ${a} (--hilfe zeigt alle)`); process.exit(2); }
}

function jahreAus(s) {
  const out = new Set();
  for (const teil of s.split(",")) {
    const m = teil.trim().match(/^(\d{4})(?:-(\d{4}))?$/);
    if (!m) { console.error(`--jahre: "${teil}" ist kein Jahr oder Bereich`); process.exit(2); }
    for (let j = Number(m[1]); j <= Number(m[2] ?? m[1]); j++) out.add(j);
  }
  return out;
}

if (existsSync(join(P, ".env.local"))) process.loadEnvFile(join(P, ".env.local"));
if (!process.env.DATABASE_URL) { console.error("Abbruch: DATABASE_URL ist nicht gesetzt."); process.exit(2); }
// Testdaten nur lokal – vor allem anderen, unabhängig von weiteren Optionen.
if (opt.testdaten && !istLokal(process.env.DATABASE_URL)) {
  console.error("Abbruch: --testdaten ist nur erlaubt, wenn DATABASE_URL auf localhost zeigt (localhost, 127.0.0.1, ::1).");
  process.exit(2);
}
if (!opt.dryRun && !(Number.isInteger(opt.als) && opt.als > 0)) {
  console.error("Abbruch: Ohne --dry-run ist --als <kameradId> Pflicht (wer importiert).");
  process.exit(2);
}
if (!existsSync(opt.datei)) { console.error(`Abbruch: Excel-Datei nicht gefunden (${opt.datei}).`); process.exit(2); }
const zuordnungsPfad = opt.zuordnung ?? join(P, "data", "import", "zuordnung.json");
if (opt.zuordnung && !existsSync(opt.zuordnung)) { console.error(`Abbruch: Zuordnungsdatei nicht gefunden (${opt.zuordnung}).`); process.exit(2); }
let zuordnung = {};
if (existsSync(zuordnungsPfad)) {
  try { zuordnung = JSON.parse(readFileSync(zuordnungsPfad, "utf8")); }
  catch (e) { console.error(`Abbruch: Zuordnungsdatei ist kein gültiges JSON (${e.message}).`); process.exit(2); }
}

const req = createRequire(join(P, "package.json"));
const ExcelJS = (await import(pathToFileURL(req.resolve("exceljs")).href)).default;
const postgres = (await import(pathToFileURL(req.resolve("postgres")).href)).default;

// ── Excel lesen ─────────────────────────────────────────────────────────────
const EXCEL_NULL = Date.UTC(1899, 11, 30);
const pad = (n) => String(n).padStart(2, "0");

function zellwert(v) {
  if (v == null) return null;
  if (v instanceof Date || typeof v === "number") return v;
  if (typeof v === "object") {
    if (v.richText) return v.richText.map((r) => r.text).join("");
    if ("result" in v) return zellwert(v.result);
    if ("text" in v) return String(v.text);
    if ("error" in v) return null;
    return null;
  }
  return String(v);
}
function datumAus(v) {
  v = zellwert(v);
  if (v == null || v === "") return "";
  if (typeof v === "number") v = new Date(EXCEL_NULL + Math.round(v) * 86400000);
  if (v instanceof Date) {
    const d = new Date(Math.round(v.getTime() / 86400000) * 86400000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const m = norm(v).match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  return m ? `${m[3]}-${pad(m[2])}-${pad(m[1])}` : norm(v);
}
function zeitAus(v) {
  v = zellwert(v);
  if (v == null || v === "") return null;
  let min = null;
  if (v instanceof Date) min = Math.round((v.getTime() - EXCEL_NULL) / 60000);
  else if (typeof v === "number") min = Math.round(v * 1440);
  else { const m = norm(v).match(/^(\d{1,2})[:.](\d{2})/); if (m) min = Number(m[1]) * 60 + Number(m[2]); }
  if (min == null) return null;
  min = ((min % 1440) + 1440) % 1440;
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}
const SPALTEN = { datum: ["datum"], typ: ["typ"], uhrzeit: ["uhrzeit"], thema: ["thema"], ausbilder: ["ausbilder"], ort: ["option wg. umbau", "spalte1", "ort"] };

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(opt.datei);
const zeilen = [];
const jahre = [];
const lesefehler = [];
for (const ws of wb.worksheets) {
  const m = ws.name.match(/^Dienstplan (\d{4})$/);
  if (!m) continue;
  const jahr = Number(m[1]);
  if (opt.jahre && !opt.jahre.has(jahr)) continue;
  jahre.push(jahr);
  const kopf = new Map();
  ws.getRow(1).eachCell((c, i) => { const t = vergleich(zellwert(c.value)); for (const [k, namen] of Object.entries(SPALTEN)) if (namen.includes(t) && !kopf.has(k)) kopf.set(k, i); });
  for (const pflicht of ["datum", "typ", "thema"]) if (!kopf.has(pflicht)) lesefehler.push(`Blatt "${ws.name}": Spalte ${pflicht} fehlt`);
  const zelle = (row, k) => (kopf.has(k) ? row.getCell(kopf.get(k)).value : null);
  ws.eachRow((row, nr) => {
    if (nr === 1) return;
    const z = {
      jahr, zeile: nr, datum: datumAus(zelle(row, "datum")), typ: norm(zellwert(zelle(row, "typ"))),
      uhrzeit: zeitAus(zelle(row, "uhrzeit")), thema: norm(zellwert(zelle(row, "thema"))),
      ausbilder: norm(zellwert(zelle(row, "ausbilder"))), ort: norm(zellwert(zelle(row, "ort"))),
    };
    if (!z.datum && !z.typ && !z.thema && !z.ausbilder) return;
    zeilen.push(z);
  });
}
if (opt.jahre) for (const j of opt.jahre) if (!jahre.includes(j)) lesefehler.push(`Kein Blatt "Dienstplan ${j}"`);
if (!jahre.length) lesefehler.push("Keine Blätter \"Dienstplan JJJJ\" gefunden");
if (lesefehler.length) { console.error(`Abbruch:\n  ${lesefehler.join("\n  ")}`); process.exit(2); }
jahre.sort();

// Blatt "Gruppenführer": Namen unter der Überschrift "GF"
const gruppenfuehrer = [];
const gfBlatt = wb.getWorksheet("Gruppenführer");
if (gfBlatt) {
  let spalte = null, start = null;
  gfBlatt.eachRow((row, nr) => row.eachCell((c, i) => { if (spalte == null && vergleich(zellwert(c.value)) === "gf") { spalte = i; start = nr; } }));
  if (spalte != null) {
    for (let nr = start + 1; nr <= gfBlatt.rowCount; nr++) {
      const n = norm(zellwert(gfBlatt.getRow(nr).getCell(spalte).value));
      if (n) gruppenfuehrer.push(n);
    }
  }
}

// ── Datenbank ───────────────────────────────────────────────────────────────
class Abbruch extends Error {}
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const heute = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
const eins = (rows, was) => { if (rows.length !== 1) throw new Error(`${was}: ${rows.length} Zeilen statt 1`); return rows[0]; };
let exitCode = 0;

try {
  await sql.begin(async (tx) => {
    if (opt.dryRun) await tx`set transaction read only`;
    await tx`select set_config('app.kamerad_id', ${String(opt.als ?? 0)}, true),
                    set_config('app.dienst_rolle', 'Admin', true),
                    set_config('app.dienst_org', ${String(ORGANISATION_ID)}, true)`;

    const kategorien = await tx`select id, kuerzel, name from dienstplan.kategorien where organisation_id = ${ORGANISATION_ID}`;
    if (!kategorien.length) throw new Error("Keine Kategorien gefunden (Migration 0018 angewendet? Scope korrekt?)");
    let kameraden = [...await tx`select id, vorname, name, spitzname, aktiv from dienstplan.kameraden_namen()`];
    if (opt.als != null) {
      const ich = kameraden.find((k) => k.id === opt.als);
      if (!ich || !ich.aktiv) throw new Abbruch(`--als ${opt.als}: kein aktiver Kamerad`);
    }
    const vorhandenePlaene = new Map((await tx`select id, jahr from dienstplan.plaene where organisation_id = ${ORGANISATION_ID}`).map((p) => [p.jahr, p.id]));

    // Testdaten: fehlende Kameraden anlegen (nur lokal, oben geprüft)
    let analyse = analysiere({ zeilen, gruppenfuehrer, kameraden, kategorien, zuordnung });
    const testKameraden = [];
    if (opt.testdaten) {
      const offen = [...analyse.personen.values()]
        .filter((p) => p.status === "unbekannt" && p.klasse.art === "person")
        .sort((x, y) => Number(!(x.klasse.vorPrefix || x.klasse.vorname)) - Number(!(y.klasse.vorPrefix || y.klasse.vorname)));
      for (const p of offen) {
        const k = p.klasse;
        if (findeKameraden(k, [...kameraden, ...testKameraden]).length) continue;
        testKameraden.push({
          id: -(testKameraden.length + 1), name: k.name, aktiv: true,
          vorname: k.vorname ?? (k.vorPrefix ? `${k.vorPrefix}.` : "Test"),
          spitzname: k.spitzKandidat ? k.name : null,
        });
      }
      if (!opt.dryRun && testKameraden.length) {
        await tx`select set_config('app.app_rolle', 'Admin', true)`;
        for (const t of testKameraden) {
          const r = eins(await tx`insert into core.kameraden (name, vorname, personalnummer, spitzname, spitzname_anzeigen, aktiv)
            values (${t.name}, ${t.vorname}, ${"TEST-DP-" + randomBytes(4).toString("hex")}, ${t.spitzname}, ${t.spitzname != null}, true)
            returning id`, "Testkamerad anlegen");
          t.id = r.id;
        }
        await tx`select set_config('app.app_rolle', '', true)`;
        kameraden = [...await tx`select id, vorname, name, spitzname, aktiv from dienstplan.kameraden_namen()`];
      } else {
        kameraden = [...kameraden, ...testKameraden];
      }
      analyse = analysiere({ zeilen, gruppenfuehrer, kameraden, kategorien, zuordnung, mehrdeutigErster: true });
    }

    // Bericht
    const bericht = berichtZeilen(analyse, kameraden);
    let blockierend = analyse.blockierend;
    for (const j of jahre) {
      if (vorhandenePlaene.has(j) && !opt.ersetzen) {
        bericht.unshift({ art: "plan", status: "fehler", schreibweise: String(j), anzahl: 1, fundstellen: "", vorschlag: "Plan existiert bereits. Mit --ersetzen wird er gelöscht und neu importiert.", kandidaten: "" });
        blockierend++;
      }
    }
    for (const t of testKameraden) bericht.push({ art: "testdaten", status: opt.dryRun ? "wuerde_angelegt" : "angelegt", schreibweise: `${t.name}, ${t.vorname}`, anzahl: 1, fundstellen: "", vorschlag: t.spitzname ? `Spitzname ${t.spitzname}` : "", kandidaten: t.id > 0 ? String(t.id) : "" });
    mkdirSync(opt.bericht, { recursive: true });
    const berichtPfad = join(opt.bericht, `klaerung-${heute}.csv`);
    writeFileSync(berichtPfad, csv(bericht));
    const vorlagePfad = join(opt.bericht, `zuordnung-vorlage-${heute}.json`);
    writeFileSync(vorlagePfad, JSON.stringify(zuordnungsVorlage(analyse, zuordnung), null, 2) + "\n");

    ausgabe(analyse, bericht, { berichtPfad, vorlagePfad, blockierend, testKameraden });

    if (opt.dryRun) return;
    if (blockierend) throw new Abbruch(`${blockierend} offene Klärung(en), nichts importiert. Siehe ${rel(berichtPfad)}.`);

    await schreiben(tx, analyse, vorhandenePlaene);
  });
} catch (e) {
  if (e instanceof Abbruch) { console.error(`\nAbbruch: ${e.message}`); exitCode = 1; }
  else { console.error(`\nFEHLER, nichts importiert: ${e.message}`); exitCode = 1; }
} finally {
  await sql.end({ timeout: 5 });
}
process.exit(exitCode);

// ── Schreiben ───────────────────────────────────────────────────────────────
async function schreiben(tx, a, vorhandenePlaene) {
  const zaehler = { themenNeu: 0, bloeckeNeu: 0, externNeu: 0, ausgleich: 0, termine: 0, themen: 0, verantwortliche: 0 };

  // Externe Personen: vorhandene wiederverwenden (gleiche Organisation und gleicher Name)
  const externKey = (org, name) => `${vergleich(org)}|${vergleich(name)}`;
  const extern = new Map((await tx`select id, name, organisation from dienstplan.externe_personen where organisation_id = ${ORGANISATION_ID}`)
    .map((e) => [externKey(e.organisation, e.name), e.id]));
  const externId = async (b) => {
    const k = externKey(b.organisation, b.name);
    if (!extern.has(k)) {
      const r = eins(await tx`insert into dienstplan.externe_personen (organisation_id, name, organisation, funktion)
        values (${ORGANISATION_ID}, ${b.name}, ${b.organisation}, ${b.funktion ?? null}) returning id`, "externe Person");
      extern.set(k, r.id); zaehler.externNeu++;
    }
    return extern.get(k);
  };

  // Themenkatalog: vorhandene Titel (ohne Groß-/Kleinschreibung) wiederverwenden
  const themaId = new Map();
  const vorhandeneThemen = new Map((await tx`select id, titel from dienstplan.themen where organisation_id = ${ORGANISATION_ID}`).map((t) => [vergleich(t.titel), t.id]));
  for (const [key, t] of a.themen) {
    if (vorhandeneThemen.has(key)) { themaId.set(key, vorhandeneThemen.get(key)); continue; }
    const r = eins(await tx`insert into dienstplan.themen (organisation_id, titel) values (${ORGANISATION_ID}, ${t.titel}) returning id`, "Thema");
    themaId.set(key, r.id); zaehler.themenNeu++;
  }

  // Bestätigte Blöcke
  const blockId = new Map();
  const vorhandeneBloecke = new Map((await tx`select id, name from dienstplan.themenbloecke where organisation_id = ${ORGANISATION_ID}`).map((b) => [vergleich(b.name), b.id]));
  for (const b of a.bloecke.filter((x) => x.bestaetigt)) {
    if (vorhandeneBloecke.has(vergleich(b.name))) { blockId.set(b.key, vorhandeneBloecke.get(vergleich(b.name))); continue; }
    const r = eins(await tx`insert into dienstplan.themenbloecke (organisation_id, name) values (${ORGANISATION_ID}, ${b.name}) returning id`, "Themenblock");
    for (const [i, k] of b.keys.entries()) {
      eins(await tx`insert into dienstplan.themenblock_positionen (block_id, thema_id, position) values (${r.id}, ${themaId.get(k)}, ${i + 1}) returning id`, "Blockposition");
    }
    blockId.set(b.key, r.id); zaehler.bloeckeNeu++;
  }

  // Ausgleichspersonen (Blatt Gruppenführer), nur Kameraden
  for (const key of new Set(a.ausgleich)) {
    const b = a.personen.get(key)?.bezug;
    if (b?.art !== "kamerad") { console.log(`  Ausgleich: "${a.personen.get(key)?.schreibweise}" ist kein Kamerad, übersprungen`); continue; }
    const r = await tx`insert into dienstplan.ausgleich_personen (organisation_id, kamerad_id) values (${ORGANISATION_ID}, ${b.kameradId})
      on conflict do nothing returning kamerad_id`;
    zaehler.ausgleich += r.length;
  }

  // Pläne
  for (const jahr of jahre) {
    if (vorhandenePlaene.has(jahr)) {
      eins(await tx`delete from dienstplan.plaene where id = ${vorhandenePlaene.get(jahr)} returning id`, `Plan ${jahr} löschen`);
    }
    const plan = eins(await tx`insert into dienstplan.plaene (organisation_id, jahr, status, freigegeben_am, freigegeben_von)
      values (${ORGANISATION_ID}, ${jahr}, 'freigegeben', now(), ${opt.als}) returning id`, `Plan ${jahr}`);
    const termine = a.termine.filter((t) => t.jahr === jahr).sort((x, y) => x.datum.localeCompare(y.datum) || String(x.uhrzeit).localeCompare(String(y.uhrzeit)));
    for (const t of termine) {
      const tr = eins(await tx`insert into dienstplan.termine (plan_id, datum, uhrzeit, kategorie_id, quelle, ausgefallen, ort, bemerkung)
        values (${plan.id}, ${t.datum}, ${t.uhrzeit}, ${t.kategorieId}, 'manuell', ${t.ausgefallen}, ${t.ort}, ${t.bemerkung}) returning id`, "Termin");
      zaehler.termine++;
      for (const [i, th] of t.themen.entries()) {
        const tt = eins(await tx`insert into dienstplan.termin_themen (termin_id, thema_id, titel_freitext, position, aus_block_id)
          values (${tr.id}, ${th.themaKey ? themaId.get(th.themaKey) : null}, ${th.freitext}, ${i + 1},
                  ${th.themaKey && t.blockKey ? blockId.get(t.blockKey) ?? null : null}) returning id`, "Termin-Thema");
        zaehler.themen++;
        const gesehen = new Set();
        let pos = 0;
        for (const pk of th.personen) {
          const b = a.personen.get(pk).bezug;
          const kamerad = b.art === "kamerad" ? b.kameradId : null;
          const ext = b.art === "extern" ? await externId(b) : null;
          const platz = b.art === "platzhalter" ? b.wert : null;
          const k = `${kamerad}|${ext}|${platz}`;
          if (gesehen.has(k)) continue;
          gesehen.add(k);
          eins(await tx`insert into dienstplan.termin_verantwortliche (termin_thema_id, kamerad_id, externe_person_id, platzhalter, position)
            values (${tt.id}, ${kamerad}, ${ext}, ${platz}, ${++pos}) returning id`, "Verantwortlicher");
          zaehler.verantwortliche++;
        }
      }
    }
    console.log(`  Plan ${jahr}: ${termine.length} Termine, freigegeben`);
  }
  console.log(`\nImportiert: ${zaehler.termine} Termine, ${zaehler.themen} Themen an Terminen, ${zaehler.verantwortliche} Verantwortliche.`);
  console.log(`Neu angelegt: ${zaehler.themenNeu} Themen im Katalog, ${zaehler.bloeckeNeu} Blöcke, ${zaehler.externNeu} externe Personen, ${zaehler.ausgleich} Ausgleichspersonen.`);
}

// ── Konsole ─────────────────────────────────────────────────────────────────
function rel(p) { return p.startsWith(P + "/") ? p.slice(P.length + 1) : p; }

function ausgabe(a, bericht, { berichtPfad, vorlagePfad, blockierend, testKameraden }) {
  const personen = [...a.personen.values()];
  const anz = (s) => personen.filter((p) => p.status === s).length;
  console.log(`Dienstplan-Import${opt.dryRun ? " – PROBELAUF, es wird nichts geschrieben" : ""}${opt.testdaten ? " – TESTDATEN" : ""}`);
  console.log(`Datei: ${rel(opt.datei)}  Jahre: ${jahre.join(", ")}${existsSync(zuordnungsPfad) ? `  Zuordnung: ${rel(zuordnungsPfad)}` : ""}`);
  console.log(`Termine: ${a.termine.length} (davon ausgefallen ${a.termine.filter((t) => t.ausgefallen).length})`);
  console.log(`Themenkatalog: ${a.themen.size} Themen, ${a.themenVorschlaege.length} Vorschläge zum Zusammenführen`);
  console.log(`Blöcke: ${a.bloecke.length} erkannt (${a.bloecke.map((b) => `${b.name}: ${b.anzahl}×`).join(", ")}), ${a.blockVorschlaege.length} Titel mit "/" mehrfach als ein Thema`);
  console.log(`Personen: ${personen.length} (Schreibvarianten zusammengefasst), zugeordnet ${anz("zugeordnet")}, unbekannt ${anz("unbekannt")}, mehrdeutig ${anz("mehrdeutig")}, Fehler ${anz("fehler")}`);
  if (testKameraden.length) console.log(`Testdaten: ${testKameraden.length} Kameraden ${opt.dryRun ? "würden angelegt" : "angelegt"}`);

  const offen = bericht.filter((z) => ["fehler", "unbekannt", "mehrdeutig"].includes(z.status));
  if (offen.length) {
    console.log(`\nOffene Klärungen (blockieren den Import): ${blockierend}`);
    for (const z of offen) console.log(`  ${z.art.padEnd(7)} ${z.status.padEnd(10)} ${z.schreibweise}  (${z.anzahl}×)${z.kandidaten ? `  Kandidaten: ${z.kandidaten}` : ""}${z.art !== "person" ? `  ${z.vorschlag}` : ""}`);
  }
  const hinweise = bericht.filter((z) => z.status === "hinweis");
  if (hinweise.length) {
    console.log(`\nHinweise (blockieren nicht): ${hinweise.length}`);
    for (const z of hinweise) console.log(`  ${z.fundstellen}: ${z.vorschlag}`);
  }
  console.log(`\nKlärungsbericht: ${rel(berichtPfad)}`);
  console.log(`Vorlage Zuordnung: ${rel(vorlagePfad)} (geprüft als ${rel(zuordnungsPfad)} speichern)`);
  if (opt.dryRun) console.log(blockierend ? `\nImport wäre so NICHT möglich: ${blockierend} offene Klärung(en).` : "\nImport wäre so möglich.");
}
