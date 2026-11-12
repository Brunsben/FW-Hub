// Phase 10 Ende zu Ende: Exportprofile (Rechte, Prüfung, Löschen), CSV-Export
// (DIVERA-Seed, nur freigegeben, komplett/Änderungen mit Löschliste, Protokoll),
// .ics (Mitglied und Planer, Änderungen), Excel (Blätter, Farben), iCal-Abo
// (anlegen nur Admin, Feed ohne Login, nur freigegebene Pläne, Zähler,
// widerrufen → 404).
// Testkonten Admin, Planer, Mitglied; Pläne 2083 (freigegeben) und 2082 (Entwurf).
//
// Aufruf:  node scripts/test-dienstplan-export.mjs
// Voraussetzung: Dev-Server (npx next dev --webpack -p 3100) mit derselben Datenbank.
// Env (aus .env.local): MIGRATE_DATABASE_URL (Owner), TEST_BASE optional.
// Achtung: Der Test widerruft ein bestehendes Abo der Organisation 1 nicht
// dauerhaft – er sichert dessen Zeile und stellt sie am Ende wieder her.
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { schutz } from "./lib/schutz.mjs";

const P = resolve(fileURLToPath(new URL("..", import.meta.url)));
if (existsSync(`${P}/.env.local`)) process.loadEnvFile(`${P}/.env.local`);
const BASE = process.env.TEST_BASE || "http://localhost:3100";
schutz({ db: ["MIGRATE_DATABASE_URL"], base: BASE });
const req = createRequire(`${P}/package.json`);
const imp = async (m) => (await import(pathToFileURL(req.resolve(m)).href)).default;
const postgres = await imp("postgres");
const bcrypt = await imp("bcryptjs");
const ExcelJS = await imp("exceljs");
const owner = postgres(process.env.MIGRATE_DATABASE_URL, { max: 1, onnotice: () => {} });

let fail = 0, ok = 0;
const check = (name, cond, extra = "") => {
  if (cond) { ok++; console.log(`OK   ${name}`); }
  else { fail++; console.log(`FEHLER ${name}${extra ? " — " + extra : ""}`); }
};

const S = `dpex${Date.now().toString(36)}`;
const JAHR = 2083, ENTWURF = 2082;
const ids = { kam: [], ben: [], plan: [], thema: [], profil: [] };
let ip = 140;
let altesAbo = [];

async function konto(rolle) {
  const [k] = await owner`insert into core.kameraden (name, vorname, dienst_rolle) values (${S + rolle}, 'Ex', ${rolle === "Mitglied" ? null : rolle}) returning id`;
  ids.kam.push(k.id);
  const pin = `pin-${S}`;
  const [b] = await owner`insert into core.benutzer (benutzername, pin, rolle, kamerad_id) values (${(S + rolle).toLowerCase()}, ${await bcrypt.hash(pin, 10)}, 'User', ${k.id}) returning id`;
  ids.ben.push(b.id);
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json", "x-real-ip": `203.0.113.${ip++}` },
    body: JSON.stringify({ benutzername: (S + rolle).toLowerCase(), pin }),
  });
  if (r.status !== 200) throw new Error(`Login ${rolle}: ${r.status}`);
  return { kameradId: k.id, cookie: (r.headers.get("set-cookie") || "").split(";")[0] };
}
async function api(wer, methode, pfad, body) {
  const r = await fetch(`${BASE}/api/dienstplan${pfad}`, {
    method: methode,
    headers: { ...(wer ? { cookie: wer.cookie } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* kein JSON */ }
  return { status: r.status, json, text, headers: r.headers };
}
const s = (r) => `${r.status} ${(r.json ? JSON.stringify(r.json) : r.text)?.slice(0, 260)}`;
const datei = (r) => Buffer.from(r.json.inhalt, "base64");

try {
  await owner`delete from dienstplan.plaene where jahr in (${JAHR}, ${ENTWURF})`;
  altesAbo = await owner`select * from dienstplan.ical_abos where organisation_id = 1 and widerrufen_am is null`;
  const admin = await konto("Admin"), planer = await konto("Planer"), mitglied = await konto("Mitglied");
  const kat = Object.fromEntries((await owner`select kuerzel, id from dienstplan.kategorien where organisation_id = 1`).map((k) => [k.kuerzel, k.id]));
  const [th] = await owner`insert into dienstplan.themen (organisation_id, titel) values (1, ${S + " Pumpen; Armaturen"}) returning id`;
  ids.thema.push(th.id);
  const plan = async (jahr, status) => {
    const [p] = await owner`insert into dienstplan.plaene (organisation_id, jahr, status) values (1, ${jahr}, ${status}) returning id`;
    ids.plan.push(p.id); return p.id;
  };
  const pJ = await plan(JAHR, "freigegeben"), pE = await plan(ENTWURF, "entwurf");
  const termin = async (planId, datum, uhrzeit, k, extra = {}) =>
    (await owner`insert into dienstplan.termine (plan_id, datum, uhrzeit, kategorie_id, ausgefallen, ort)
      values (${planId}, ${datum}, ${uhrzeit}, ${kat[k]}, ${extra.ausgefallen ?? false}, ${extra.ort ?? null}) returning id`)[0].id;
  const t1 = await termin(pJ, `${JAHR}-01-11`, "19:30", "D", { ort: "Gerätehaus" });
  const [tt1] = await owner`insert into dienstplan.termin_themen (termin_id, position, thema_id) values (${t1}, 1, ${th.id}) returning id`;
  await owner`insert into dienstplan.termin_verantwortliche (termin_thema_id, kamerad_id, position) values (${tt1.id}, ${planer.kameradId}, 1)`;
  const t2 = await termin(pJ, `${JAHR}-07-06`, "19:30", "Z");
  await termin(pJ, `${JAHR}-03-01`, null, "D", { ausgefallen: true });
  const t4 = await termin(pJ, `${JAHR}-12-04`, "22:00", "K");
  await termin(pE, `${ENTWURF}-02-02`, "19:30", "D");

  // ── Profile ──
  let r = await api(planer, "GET", "/export-profile");
  const divera = r.json?.profile?.find((p) => p.name === "DIVERA 24/7");
  check("Planer liest Profile, Seed DIVERA 24/7 vorhanden", r.status === 200 && divera && divera.spalten.map((x) => x.ueberschrift).join() === "Datum,Von,Bis,Titel,Text,Ort", s(r));
  check("Seed DIVERA (Beginn/Ende) vorhanden", r.json.profile.some((p) => p.name === "DIVERA 24/7 (Beginn/Ende)"));
  r = await api(mitglied, "GET", "/export-profile");
  check("Mitglied: Profile → 403", r.status === 403, s(r));
  const neuesProfil = { name: `${S} Test`, trennzeichen: ",", kodierung: "windows-1252", kopfzeile: true, nurFreigegeben: false, kategorien: ["D"],
    spalten: [{ ueberschrift: "Beginn", feld: "start", format: "YYYY-MM-DD HH:mm" }, { ueberschrift: "Titel", feld: "titel" }, { ueberschrift: "Gruppe", feld: "fest", wert: "Alle" }] };
  r = await api(planer, "POST", "/export-profile", neuesProfil);
  check("Planer: Profil anlegen → 403", r.status === 403, s(r));
  r = await api(admin, "POST", "/export-profile", { ...neuesProfil, spalten: [{ ueberschrift: "X", feld: "geheim" }] });
  check("Admin: ungültiges Feld → 400", r.status === 400, s(r));
  r = await api(admin, "POST", "/export-profile", neuesProfil);
  const profilId = r.json?.id;
  if (profilId) ids.profil.push(profilId);
  check("Admin: Profil anlegen → 201", r.status === 201 && profilId > 0, s(r));
  r = await api(admin, "PATCH", `/export-profile/${profilId}`, { ...neuesProfil, name: `${S} Test2` });
  check("Admin: Profil ändern", r.status === 200, s(r));

  // ── CSV ──
  r = await api(planer, "POST", `/plaene/${ENTWURF}/export/csv`, { profilId: divera.id });
  check("DIVERA nur freigegeben: Entwurf → 409", r.status === 409, s(r));
  r = await api(mitglied, "POST", `/plaene/${JAHR}/export/csv`, { profilId: divera.id });
  check("Mitglied: CSV → 403", r.status === 403, s(r));
  r = await api(planer, "POST", `/plaene/${JAHR}/export/csv`, { profilId: divera.id, modus: "aenderungen" });
  const csv1 = r.status === 200 ? datei(r) : Buffer.alloc(0);
  const text1 = csv1.subarray(3).toString("utf8");
  check("DIVERA: erster Lauf 'Änderungen' wirkt wie komplett", r.status === 200 && r.json.modus === "komplett" && r.json.anzahl === 3 && r.json.loeschen.length === 0, s(r));
  check("DIVERA: BOM, Kopfzeile, ohne abgesagten Termin", csv1[0] === 0xef && text1.startsWith("Datum;Von;Bis;Titel;Text;Ort\r\n") && !text1.includes(`${JAHR}-03-01`) && text1.split("\r\n").length === 5, text1.slice(0, 200));
  check("DIVERA: Zeile mit Feldern, Quoting bei ;", text1.includes(`11.01.${JAHR};19:30;21:30;"Dienstabend: ${S} Pumpen; Armaturen";`), text1.split("\r\n")[1]);
  check("DIVERA: über Mitternacht (Bis 02:00)", text1.includes(`04.12.${JAHR};22:00;02:00;Kameradschaft`), text1);
  check("Dateiname", /^dienstplan-2083-divera-24-7-\d{8}\.csv$/.test(r.json.dateiname), r.json.dateiname);
  // Änderung nach dem Export
  await owner`update dienstplan.termine set datum = ${`${JAHR}-01-18`} where id = ${t1}`;
  await owner`delete from dienstplan.termine where id = ${t2}`;
  r = await api(planer, "POST", `/plaene/${JAHR}/export/csv`, { profilId: divera.id, modus: "aenderungen" });
  const text2 = r.status === 200 ? datei(r).subarray(3).toString("utf8") : "";
  check("DIVERA Änderungen: nur der verschobene Termin", r.status === 200 && r.json.modus === "aenderungen" && r.json.anzahl === 1 && text2.includes(`18.01.${JAHR}`) && !text2.includes("Kameradschaft"), s(r));
  check("DIVERA Änderungen: Löschliste alte Fassung und entfallener Termin",
    JSON.stringify(r.json?.loeschen?.map((l) => [l.terminId, l.datum, l.grund])) === JSON.stringify([[t1, `${JAHR}-01-11`, "geaendert"], [t2, `${JAHR}-07-06`, "entfallen"]]), JSON.stringify(r.json?.loeschen));
  r = await api(planer, "POST", `/plaene/${JAHR}/export/csv`, { profilId: divera.id, modus: "aenderungen" });
  check("DIVERA Änderungen erneut: leer", r.status === 200 && r.json.anzahl === 0 && r.json.loeschen.length === 0, s(r));
  r = await api(planer, "POST", `/plaene/${JAHR}/export/csv`, { profilId: profilId, halbjahr: 1 });
  const text3 = r.status === 200 ? new TextDecoder("windows-1252").decode(datei(r)) : "";
  check("Eigenes Profil: Komma, Windows-1252, nur Kategorie D, Halbjahr 1, fester Wert", r.status === 200 && text3 === `Beginn,Titel,Gruppe\r\n${JAHR}-01-18 19:30,${S} Pumpen; Armaturen,Alle\r\n`, JSON.stringify(text3));
  r = await api(planer, "POST", `/plaene/${JAHR}/export/csv`, { profilId: divera.id, modus: "quatsch" });
  check("ungültiger Modus → 400", r.status === 400, s(r));
  r = await api(planer, "GET", `/plaene/${JAHR}/export/laeufe`);
  check("Protokoll: 4 CSV-Läufe", r.status === 200 && r.json.laeufe.filter((l) => l.format === "csv").length === 4, s(r));
  r = await api(admin, "DELETE", `/export-profile/${profilId}`);
  check("Profil mit Läufen löschen → 409", r.status === 409, s(r));

  // ── iCal ──
  r = await api(mitglied, "POST", `/plaene/${JAHR}/export/ics`, {});
  const ics = r.status === 200 ? datei(r).toString("utf8") : "";
  check("Mitglied: .ics des freigegebenen Plans (inkl. abgesagt)", r.status === 200 && (ics.match(/BEGIN:VEVENT/g) ?? []).length === 3 && ics.includes(`UID:dienstplan-${t1}@ofwietmarschen.org`) && ics.includes("STATUS:CANCELLED"), s(r));
  check("Mitglied: ohne Protokoll", (await owner`select count(*)::int n from dienstplan.export_laeufe where plan_id = ${pJ} and format = 'ics'`)[0].n === 0);
  r = await api(mitglied, "POST", `/plaene/${JAHR}/export/ics`, { modus: "aenderungen" });
  check("Mitglied: Änderungen → 403", r.status === 403, s(r));
  r = await api(mitglied, "POST", `/plaene/${ENTWURF}/export/ics`, {});
  check("Mitglied: Entwurf → 404", r.status === 404, s(r));
  r = await api(planer, "POST", `/plaene/${JAHR}/export/ics`, { halbjahr: 2, kategorien: ["K"] });
  const ics2 = r.status === 200 ? datei(r).toString("utf8") : "";
  check("Planer: Halbjahr 2, nur K", r.status === 200 && (ics2.match(/BEGIN:VEVENT/g) ?? []).length === 1 && ics2.includes(`UID:dienstplan-${t4}@`), s(r));
  r = await api(planer, "POST", `/plaene/${JAHR}/export/ics`, { modus: "aenderungen" });
  check("Planer: Änderungen nach gefiltertem Lauf → nur die noch nicht exportierten (2)", r.status === 200 && r.json.modus === "aenderungen" && r.json.anzahl === 2, `${r.status} ${r.json?.modus} ${r.json?.anzahl}`);
  await owner`update dienstplan.termine set ort = 'Halle' where id = ${t4}`;
  r = await api(planer, "POST", `/plaene/${JAHR}/export/ics`, { modus: "aenderungen" });
  const ics3 = r.status === 200 ? datei(r).toString("utf8") : "";
  check("Planer: Änderungen → nur geänderter Termin mit höherer SEQUENCE", r.status === 200 && r.json.anzahl === 1 && ics3.includes(`UID:dienstplan-${t4}@`) && ics3.includes("LOCATION:Halle"), s(r));
  r = await api(planer, "POST", `/plaene/${JAHR}/export/ics`, { kategorien: "D;drop" });
  check("ungültige Kategorien → 400", r.status === 400, s(r));

  // ── Excel ──
  r = await api(planer, "POST", `/plaene/${JAHR}/export/xlsx`, {});
  check("Excel → 200, xlsx-Dateiname", r.status === 200 && /\.xlsx$/.test(r.json.dateiname), s(r));
  if (r.status === 200) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(datei(r));
    check("Excel: Blätter 1. Halbjahr, 2. Halbjahr, Gesamt", wb.worksheets.map((w) => w.name).join() === "1. Halbjahr,2. Halbjahr,Gesamt");
    const ws = wb.getWorksheet("1. Halbjahr");
    check("Excel: Titel und Kopfzeile", ws.getCell("A1").value === `Dienstplan ${JAHR} – 1. Halbjahr` && ws.getRow(3).values.slice(1).join() === "Datum,Wochentag,Kürzel,Uhrzeit,Thema,Verantwortlich");
    const z4 = ws.getRow(4).values.slice(1);
    check("Excel: erste Zeile Datum, Wochentag, Kürzel, Uhrzeit, Thema", z4[0] === `18.01.${JAHR}` && z4[1] === "Mo" && z4[2] === "D" && z4[3] === "19:30" && String(z4[4]).includes("Pumpen"), JSON.stringify(z4));
    check("Excel: Kürzelzelle in voller Farbe, Zeile getönt", ws.getRow(4).getCell(3).fill?.fgColor?.argb === "FF007AFF" && ws.getRow(4).getCell(5).fill?.fgColor?.argb === "FFCCE4FF");
    const z5 = ws.getRow(5).values.slice(1);
    check("Excel: abgesagter Termin mit 'entfällt'", z5[0] === `01.03.${JAHR}` && String(z5[4]).startsWith("entfällt"), JSON.stringify(z5));
    check("Excel: Druck A4 hoch, an Breite angepasst, Kopfzeile wiederholt", ws.pageSetup.paperSize === 9 && ws.pageSetup.orientation === "portrait" && ws.pageSetup.fitToWidth === 1 && ws.pageSetup.printTitlesRow === "3:3");
    check("Excel: Fußzeile mit Stand", /Stand: \d\d\.\d\d\.\d{4}/.test(ws.headerFooter.oddFooter ?? ""));
  }
  r = await api(mitglied, "POST", `/plaene/${JAHR}/export/xlsx`, {});
  check("Mitglied: Excel → 403", r.status === 403, s(r));

  // ── iCal-Abo ──
  r = await api(planer, "POST", "/abo");
  check("Planer: Abo anlegen → 403", r.status === 403, s(r));
  r = await api(admin, "POST", "/abo");
  const pfad = r.json?.pfad;
  check("Admin: Abo anlegen → 201 mit Pfad", r.status === 201 && /^\/api\/dienstplan\/abo\/[A-Za-z0-9_-]{43}\.ics$/.test(pfad ?? ""), s(r));
  const token = pfad?.split("/").pop().replace(".ics", "");
  const [abo] = await owner`select token_hash, abrufe from dienstplan.ical_abos where organisation_id = 1 and widerrufen_am is null`;
  check("Abo: nur der Hash gespeichert", abo && abo.token_hash.length === 64 && !abo.token_hash.includes(token));
  const feed = await fetch(`${BASE}${pfad}`);
  const ftext = await feed.text();
  check("Feed ohne Login → 200 text/calendar", feed.status === 200 && (feed.headers.get("content-type") ?? "").startsWith("text/calendar"), `${feed.status}`);
  check("Feed: Termine des freigegebenen Plans, nicht des Entwurfs, ohne Notizen-Feld", ftext.includes(`UID:dienstplan-${t1}@`) && !ftext.includes(`${ENTWURF}0202`) && !ftext.includes("NOTIZ"));
  check("Feed: Cache-Control no-store", (feed.headers.get("cache-control") ?? "").includes("no-store"));
  const feed2 = await fetch(`${BASE}/api/dienstplan/abo/${token}`);
  check("Feed auch ohne .ics", feed2.status === 200);
  const [abo2] = await owner`select abrufe, zuletzt_abgerufen_am from dienstplan.ical_abos where organisation_id = 1 and widerrufen_am is null`;
  check("Abo: Abrufe gezählt", abo2.abrufe === 2 && abo2.zuletzt_abgerufen_am !== null, JSON.stringify(abo2));
  r = await api(admin, "GET", "/abo");
  check("Admin: Abo-Status ohne Token", r.status === 200 && r.json.abo.abrufe === 2 && !JSON.stringify(r.json).includes(token), s(r));
  for (const falsch of ["x".repeat(43), "kurz", `${token.slice(0, -1)}A`]) {
    const f = await fetch(`${BASE}/api/dienstplan/abo/${falsch}.ics`);
    check(`Feed mit falschem Token (${falsch.length} Zeichen) → 404`, f.status === 404, `${f.status}`);
  }
  r = await api(admin, "POST", "/abo");
  const neuerPfad = r.json?.pfad;
  check("Neues Abo: alter Link → 404, neuer → 200", (await fetch(`${BASE}${pfad}`)).status === 404 && (await fetch(`${BASE}${neuerPfad}`)).status === 200);
  r = await api(admin, "DELETE", "/abo");
  check("Abo beenden → Feed 404", r.status === 200 && r.json.widerrufen === 1 && (await fetch(`${BASE}${neuerPfad}`)).status === 404, s(r));
} finally {
  try {
    if (ids.plan.length) await owner`delete from dienstplan.plaene where id in ${owner(ids.plan)}`;
    if (ids.profil.length) await owner`delete from dienstplan.export_profile where id in ${owner(ids.profil)}`;
    if (ids.thema.length) await owner`delete from dienstplan.themen where id in ${owner(ids.thema)}`;
    // Abos: Testabos (von Testkonten) löschen, ein vorher aktives wiederherstellen
    if (ids.kam.length) await owner`delete from dienstplan.ical_abos where erstellt_von in ${owner(ids.kam)}`;
    for (const a of altesAbo) await owner`update dienstplan.ical_abos set widerrufen_am = null where id = ${a.id}`;
    if (ids.ben.length) await owner`delete from core.benutzer where id in ${owner(ids.ben)}`;
    if (ids.kam.length) await owner`delete from core.mitglieder_audit where kamerad_id in ${owner(ids.kam)}`;
    if (ids.kam.length) await owner`delete from core.kameraden where id in ${owner(ids.kam)}`;
    await owner`delete from core.login_attempts where benutzername like ${S + "%"}`;
    const [rest] = await owner`select
      (select count(*)::int from dienstplan.plaene where jahr in (${JAHR}, ${ENTWURF})) p,
      (select count(*)::int from dienstplan.export_profile where name like ${S + "%"}) e,
      (select count(*)::int from core.kameraden where name like ${S + "%"}) k`;
    console.log(`Aufräumen: Rest ${rest.p} Pläne, ${rest.e} Profile, ${rest.k} Kameraden; Abo vorher aktiv: ${altesAbo.length}`);
    if (rest.p + rest.e + rest.k > 0) fail++;
  } catch (e) { console.log("AUFRÄUMEN FEHLGESCHLAGEN:", e.message); fail++; }
  await owner.end({ timeout: 5 });
}
console.log(`\n${ok} OK, ${fail} Fehler`);
process.exit(fail ? 1 : 0);
