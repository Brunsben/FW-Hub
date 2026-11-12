// Dienstplan-API (Phase 3) Ende zu Ende: Pläne, Generator, Termine, Themen am
// Termin, Verantwortliche, Kataloge, Rechte je Rolle, ETag/304, Hinweise.
// Testkonten: Admin, Planer, Mitglied (dienst_rolle per Owner gesetzt). Plan im
// Jahr 2095, Katalogeinträge mit Zeitstempel-Präfix; Aufräumen über gemerkte IDs
// und das Präfix.
//
// Aufruf:  node scripts/test-dienstplan-api.mjs
// Voraussetzung: Dev-Server (npx next dev --webpack -p 3100) mit derselben Datenbank.
// Env (aus .env.local): MIGRATE_DATABASE_URL (Owner, nur Aufbau/Kontrolle/Aufräumen),
//   TEST_BASE optional, Standard http://localhost:3100
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { schutz } from "./lib/schutz.mjs";
import { rhythmusTreffer } from "../src/lib/dienstplan/kalender.ts";

const P = resolve(fileURLToPath(new URL("..", import.meta.url)));
if (existsSync(`${P}/.env.local`)) process.loadEnvFile(`${P}/.env.local`);
const BASE = process.env.TEST_BASE || "http://localhost:3100";
schutz({ db: ["MIGRATE_DATABASE_URL"], base: BASE });
const req = createRequire(`${P}/package.json`);
const postgres = (await import(pathToFileURL(req.resolve("postgres")).href)).default;
const bcrypt = (await import(pathToFileURL(req.resolve("bcryptjs")).href)).default;
const owner = postgres(process.env.MIGRATE_DATABASE_URL, { max: 1, onnotice: () => {} });

let fail = 0, ok = 0;
const check = (name, cond, extra = "") => {
  if (cond) { ok++; console.log(`OK   ${name}`); }
  else { fail++; console.log(`FEHLER ${name}${extra ? " — " + extra : ""}`); }
};

const S = `dpapi${Date.now().toString(36)}`;
const JAHR = 2095;
const ids = { kam: [], ben: [] };
let ipZaehler = 10;

async function konto(rolle) {
  const [k] = await owner`insert into core.kameraden (name, vorname, dienst_rolle) values (${`${S}${rolle}`}, ${"Test" + rolle}, ${rolle === "Mitglied" ? null : rolle}) returning id`;
  ids.kam.push(k.id);
  const pin = `pin-${S}`;
  const [b] = await owner`insert into core.benutzer (benutzername, pin, rolle, kamerad_id) values (${`${S}${rolle}`.toLowerCase()}, ${await bcrypt.hash(pin, 10)}, 'User', ${k.id}) returning id`;
  ids.ben.push(b.id);
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json", "x-real-ip": `203.0.113.${ipZaehler++}` },
    body: JSON.stringify({ benutzername: `${S}${rolle}`.toLowerCase(), pin }),
  });
  if (r.status !== 200) throw new Error(`Login ${rolle}: ${r.status}`);
  return { kameradId: k.id, cookie: (r.headers.get("set-cookie") || "").split(";")[0] };
}

async function api(wer, methode, pfad, body, headers = {}) {
  const r = await fetch(`${BASE}/api/dienstplan${pfad}`, {
    method: methode,
    headers: { cookie: wer.cookie, ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* kein JSON */ }
  return { status: r.status, json, etag: r.headers.get("etag") };
}
const s = (r) => `${r.status} ${JSON.stringify(r.json)?.slice(0, 200)}`;

try {
  await owner`delete from dienstplan.plaene where jahr = ${JAHR}`; // Reste eines abgebrochenen Laufs
  const admin = await konto("Admin"), planer = await konto("Planer"), mitglied = await konto("Mitglied");
  const [inaktiv] = await owner`insert into core.kameraden (name, vorname, aktiv) values (${S + "Inaktiv"}, 'Alt', false) returning id`;
  ids.kam.push(inaktiv.id);
  const kat = Object.fromEntries((await owner`select kuerzel, id from dienstplan.kategorien where organisation_id = 1`).map((k) => [k.kuerzel, k.id]));
  const regeln = (await owner`select id, name, typ, wochentag, uhrzeit::text as uhrzeit, anker_datum::text as "ankerDatum", muster,
      nter_wochentag as "nterWochentag", monate, kategorie_kuerzel as "kategorieKuerzel", gueltig_ab::text as "gueltigAb",
      gueltig_bis::text as "gueltigBis", aktiv from dienstplan.rhythmus_regeln where organisation_id = 1`).map((r) => ({ ...r }));
  const erwartet = rhythmusTreffer(regeln, JAHR);

  // ── Pläne anlegen, Generator ──
  let r = await api(planer, "POST", "/plaene", { jahr: JAHR });
  check("Plan anlegen als Planer → 403", r.status === 403, s(r));
  r = await api(admin, "POST", "/plaene", { jahr: 1999 });
  check("Plan mit ungültigem Jahr → 400", r.status === 400, s(r));
  r = await api(admin, "POST", "/plaene", { jahr: JAHR });
  check("Plan anlegen als Admin → 201, Generator legt alle Rhythmus-Treffer an", r.status === 201 && r.json.plan.status === "entwurf" && r.json.generiert.neu === erwartet.length && erwartet.length > 30, s(r));
  r = await api(admin, "POST", "/plaene", { jahr: JAHR });
  check("Zweiter Plan im selben Jahr → 409", r.status === 409, s(r));
  r = await api(planer, "POST", `/plaene/${JAHR}/generieren`);
  check("Generator erneut: idempotent (0 neu)", r.status === 200 && r.json.generiert.neu === 0, s(r));
  r = await api(mitglied, "POST", `/plaene/${JAHR}/generieren`);
  check("Generator als Mitglied → 403", r.status === 403, s(r));

  // ── Lesen, Sichtbarkeit, ETag ──
  r = await api(mitglied, "GET", `/plaene/${JAHR}`);
  check("Mitglied sieht den Entwurf nicht (404)", r.status === 404, s(r));
  r = await api(mitglied, "GET", "/plaene");
  check("Mitglied: Liste ohne den Entwurf", r.status === 200 && !r.json.plaene.some((p) => p.jahr === JAHR), s(r));
  r = await api(planer, "GET", `/plaene/${JAHR}`);
  const termine = r.json?.termine ?? [];
  check("Planer liest den Plan: Termine wie erwartet, Rhythmus mit Regel", r.status === 200 && termine.length === erwartet.length && termine.every((t) => t.quelle === "rhythmus" && t.regelId && t.rhythmusDatum === t.datum), s(r));
  check("Hinweise: Dienstabende ohne Thema", r.json.hinweise.filter((h) => h.art === "ohne_thema").length === termine.filter((t) => t.kuerzel === "D").length);
  check("Feiertage markiert (nur Feiertags-Treffer)", termine.every((t) => t.feiertag === null || typeof t.feiertag === "string"));
  const etag1 = r.etag;
  r = await api(planer, "GET", `/plaene/${JAHR}`, undefined, { "if-none-match": etag1 });
  check("If-None-Match mit aktuellem ETag → 304", r.status === 304 && r.etag === etag1, `${r.status} ${r.etag} ${etag1}`);

  // ── Termine ──
  const d1 = termine.find((t) => t.kuerzel === "D"), d2 = termine.filter((t) => t.kuerzel === "D")[1];
  r = await api(planer, "POST", `/plaene/${JAHR}/termine`, { datum: `${JAHR - 1}-12-30`, kategorieId: kat.K });
  check("Termin außerhalb des Planjahrs → 400", r.status === 400, s(r));
  r = await api(mitglied, "POST", `/plaene/${JAHR}/termine`, { datum: `${JAHR}-03-05`, kategorieId: kat.K });
  check("Termin anlegen als Mitglied → 403", r.status === 403, s(r));
  r = await api(planer, "POST", `/plaene/${JAHR}/termine`, { datum: d1.datum, kategorieId: kat.K, uhrzeit: "14:00", ort: `${S} Halle` });
  const manuell = r.json?.id;
  check("Manueller Termin → 201", r.status === 201 && manuell, s(r));
  r = await api(planer, "PATCH", `/termine/${d1.id}`, { datum: (await owner`select (${d1.datum}::date + 1)::text as d`)[0].d, uhrzeit: "19:00" });
  check("Rhythmus-Termin verschieben → 200", r.status === 200, s(r));
  r = await api(planer, "POST", `/plaene/${JAHR}/generieren`);
  check("Nach dem Verschieben legt der Generator nichts neu an", r.json?.generiert?.neu === 0, s(r));
  const [verschoben] = await owner`select datum::text, rhythmus_datum::text from dienstplan.termine where id = ${d1.id}`;
  check("Verschobener Termin behält rhythmus_datum", verschoben.rhythmus_datum === d1.datum && verschoben.datum !== d1.datum);
  r = await api(planer, "DELETE", `/termine/${d1.id}`);
  check("Rhythmus-Termin löschen → 409", r.status === 409, s(r));
  r = await api(planer, "PATCH", `/termine/${d1.id}`, { ausgefallen: true, bemerkung: "Feiertag" });
  check("Rhythmus-Termin absagen → 200", r.status === 200, s(r));
  r = await api(planer, "PATCH", `/termine/${d1.id}`, { ausgefallen: false, bemerkung: null });
  r = await api(planer, "PATCH", `/termine/${d1.id}`, { uhrzeit: "25:00" });
  check("Ungültige Uhrzeit → 400", r.status === 400, s(r));
  r = await api(planer, "PATCH", `/termine/${d1.id}`, {});
  check("PATCH ohne Felder → 400", r.status === 400, s(r));
  r = await api(planer, "GET", `/plaene/${JAHR}`, undefined, { "if-none-match": etag1 });
  check("Nach Änderungen: neuer ETag, Version gestiegen (200 statt 304)", r.status === 200 && r.etag !== etag1 && r.json.plan.version > 0, `${r.status} ${r.etag}`);

  // ── Kataloge ──
  const thema = async (titel, extra = {}) => (await api(planer, "POST", "/themen", { titel, ...extra })).json?.id;
  const tA = await thema(`${S} Knoten`), tB = await thema(`${S} Leitern`), tC = await thema(`${S} Pflicht`, { pflichtJaehrlich: true });
  check("Themen anlegen (Planer)", tA && tB && tC);
  r = await api(planer, "POST", "/themen", { titel: `${S} KNOTEN` });
  check("Doppelter Titel (Groß/klein) → 409", r.status === 409, s(r));
  r = await api(mitglied, "POST", "/themen", { titel: `${S} X` });
  check("Thema anlegen als Mitglied → 403", r.status === 403, s(r));
  r = await api(mitglied, "GET", "/themen");
  check("Mitglied liest den Katalog", r.status === 200 && r.json.themen.some((t) => t.id === tA));
  r = await api(planer, "PATCH", `/themen/${tB}`, { kurztitel: "Leit." });
  check("Thema ändern", r.status === 200, s(r));
  r = await api(planer, "POST", "/bloecke", { name: `${S} Block`, themaIds: [tA, tB] });
  const block = r.json?.id;
  check("Block anlegen", r.status === 201 && block, s(r));
  r = await api(planer, "POST", "/bloecke", { name: `${S} Kaputt`, themaIds: [tA, 999999] });
  check("Block mit unbekanntem Thema → 400", r.status === 400, s(r));
  r = await api(mitglied, "GET", "/bloecke");
  const bl = r.json?.bloecke?.find((b) => b.id === block);
  check("Block mit Themen in Reihenfolge", bl && bl.themen.map((t) => t.themaId).join() === `${tA},${tB}`, s(r));
  r = await api(planer, "POST", "/externe-personen", { organisation: `${S} DRK`, email: "drk@example.org" });
  const extern = r.json?.id;
  check("Externe Person anlegen", r.status === 201 && extern, s(r));
  r = await api(planer, "POST", "/externe-personen", { funktion: "nur Funktion" });
  check("Externe Person ohne Name und Organisation → 400", r.status === 400, s(r));
  r = await api(mitglied, "GET", "/externe-personen");
  const exM = r.json?.personen?.find((p) => p.id === extern);
  check("Mitglied sieht externe Person ohne E-Mail", exM && !("email" in exM) && exM.anzeige === `${S} DRK`, JSON.stringify(exM));
  r = await api(planer, "GET", "/externe-personen");
  check("Planer sieht die E-Mail", r.json?.personen?.find((p) => p.id === extern)?.email === "drk@example.org");
  r = await api(planer, "GET", "/personen");
  check("Personenauswahl: aktive Kameraden mit Anzeigename, ohne inaktive", r.status === 200 && r.json.kameraden.some((k) => k.id === planer.kameradId) && !r.json.kameraden.some((k) => k.id === inaktiv.id) && r.json.externe.some((e) => e.id === extern), s(r));
  r = await api(mitglied, "GET", "/personen");
  check("Personenauswahl als Mitglied → 403", r.status === 403, s(r));

  // ── Themen am Termin ──
  r = await api(planer, "POST", `/termine/${d1.id}/themen`, { themaId: tA });
  const tt1 = r.json?.ids?.[0];
  check("Thema an Termin", r.status === 201 && tt1, s(r));
  r = await api(planer, "POST", `/termine/${d1.id}/themen`, { titelFreitext: `${S} Sonderteil` });
  const tt2 = r.json?.ids?.[0];
  r = await api(planer, "POST", `/termine/${d1.id}/themen`, { blockId: block });
  const [tt3, tt4] = r.json?.ids ?? [];
  check("Block an Termin: zwei Positionen", r.status === 201 && tt3 && tt4, s(r));
  r = await api(planer, "POST", `/termine/${d1.id}/themen`, { themaId: tA, blockId: block });
  check("Thema und Block zugleich → 400", r.status === 400, s(r));
  const themenVon = async (terminId) => (await api(planer, "GET", `/plaene/${JAHR}`)).json.termine.find((t) => t.id === terminId).themen;
  let th = await themenVon(d1.id);
  check("Reihenfolge 1..4, Block-Themen mit ausBlockId", th.map((x) => `${x.position}:${x.titel}:${x.ausBlockId ?? "-"}`).join("|") ===
    `1:${S} Knoten:-|2:${S} Sonderteil:-|3:${S} Knoten:${block}|4:${S} Leitern:${block}`, JSON.stringify(th.map((x) => [x.position, x.titel, x.ausBlockId])));
  r = await api(planer, "PATCH", `/termin-themen/${tt4}`, { position: 1 });
  th = await themenVon(d1.id);
  check("Umsortieren: letzte Position nach vorne", r.status === 200 && th.map((x) => x.id).join() === [tt4, tt1, tt2, tt3].join() && th.map((x) => x.position).join() === "1,2,3,4", JSON.stringify(th.map((x) => [x.id, x.position])));
  r = await api(planer, "PATCH", `/termin-themen/${tt2}`, { terminId: d2.id });
  const th2 = await themenVon(d2.id);
  th = await themenVon(d1.id);
  check("In anderen Termin verschieben: dort am Ende, Quelle lückenlos", r.status === 200 && th2.at(-1)?.id === tt2 && th.map((x) => x.position).join() === "1,2,3", JSON.stringify([th.map((x) => x.position), th2.map((x) => x.id)]));
  r = await api(mitglied, "PATCH", `/termin-themen/${tt1}`, { position: 1 });
  check("Umsortieren als Mitglied → 403", r.status === 403, s(r));

  // ── Verantwortliche ──
  r = await api(planer, "POST", `/termin-themen/${tt1}/verantwortliche`, { kameradId: planer.kameradId });
  const v1 = r.json?.id;
  check("Kamerad als Verantwortlicher", r.status === 201 && v1, s(r));
  r = await api(planer, "POST", `/termin-themen/${tt1}/verantwortliche`, { kameradId: planer.kameradId });
  check("Doppelt → 409", r.status === 409, s(r));
  r = await api(planer, "POST", `/termin-themen/${tt1}/verantwortliche`, { kameradId: inaktiv.id });
  check("Inaktiver Kamerad → 400", r.status === 400, s(r));
  r = await api(planer, "POST", `/termin-themen/${tt1}/verantwortliche`, { platzhalter: "offen" });
  check("Platzhalter über die API → 400", r.status === 400, s(r));
  r = await api(planer, "POST", `/termin-themen/${tt1}/verantwortliche`, { externePersonId: extern });
  const v2 = r.json?.id;
  check("Externe Person als Verantwortliche", r.status === 201 && v2, s(r));
  th = await themenVon(d1.id);
  const vs = th.find((x) => x.id === tt1).verantwortliche;
  check("Plan zeigt Verantwortliche mit Namen und Position", vs.length === 2 && vs[0].art === "kamerad" && vs[0].name.length > 0 && vs[1].art === "extern" && vs[1].name === `${S} DRK` && vs[1].position === 2, JSON.stringify(vs));
  r = await api(planer, "DELETE", `/termin-verantwortliche/${v1}`);
  th = await themenVon(d1.id);
  check("Verantwortlichen entfernen, Rest rückt auf Position 1", r.status === 200 && th.find((x) => x.id === tt1).verantwortliche.map((v) => `${v.id}:${v.position}`).join() === `${v2}:1`);

  // ── Hinweis: Person am selben Tag mehrfach ──
  const [{ datum: d1Datum }] = await owner`select datum::text from dienstplan.termine where id = ${d1.id}`;
  r = await api(planer, "POST", `/plaene/${JAHR}/termine`, { datum: d1Datum, kategorieId: kat.Z, uhrzeit: "20:00" });
  const zweiter = r.json.id;
  r = await api(planer, "POST", `/termine/${zweiter}/themen`, { titelFreitext: `${S} Zweiter` });
  await api(planer, "POST", `/termin-themen/${r.json.ids[0]}/verantwortliche`, { kameradId: admin.kameradId });
  await api(planer, "POST", `/termin-themen/${tt3}/verantwortliche`, { kameradId: admin.kameradId });
  r = await api(planer, "GET", `/plaene/${JAHR}`);
  check("Hinweis: Person am selben Tag mehrfach eingeplant", r.json.hinweise.some((h) => h.art === "doppelt"), JSON.stringify(r.json.hinweise.filter((h) => h.art !== "ohne_thema")));
  check("Hinweis: Pflichtthema fehlt", r.json.hinweise.some((h) => h.art === "pflichtthema" && h.text.includes(`${S} Pflicht`)));
  check("Hinweis: Themenposition ohne Verantwortliche", r.json.hinweise.some((h) => h.art === "ohne_verantwortliche" && h.terminId === d1.id));

  // ── Löschen ──
  r = await api(planer, "DELETE", `/termin-themen/${tt3}`);
  th = await themenVon(d1.id);
  check("Themenposition löschen, Rest lückenlos", r.status === 200 && th.map((x) => x.position).join() === "1,2", JSON.stringify(th.map((x) => x.position)));
  r = await api(planer, "DELETE", `/bloecke/${block}`);
  check("Benutzten Block löschen → 409", r.status === 409, s(r));
  r = await api(planer, "DELETE", `/termine/${manuell}`);
  check("Manuellen Termin löschen → 200", r.status === 200, s(r));

  // ── Freigabe ──
  r = await api(planer, "PATCH", `/plaene/${JAHR}`, { status: "freigegeben" });
  check("Freigabe als Planer → 403", r.status === 403, s(r));
  r = await api(admin, "PATCH", `/plaene/${JAHR}`, { status: "freigegeben" });
  check("Freigabe als Admin → freigegeben_von, freigegeben_am", r.status === 200 && r.json.plan.status === "freigegeben" && r.json.plan.freigegebenVon === admin.kameradId && r.json.plan.freigegebenAm, s(r));
  r = await api(admin, "PATCH", `/plaene/${JAHR}`, { status: "freigegeben" });
  check("Erneut freigeben → 409", r.status === 409, s(r));
  r = await api(mitglied, "GET", `/plaene/${JAHR}`);
  check("Mitglied sieht den freigegebenen Plan", r.status === 200 && r.json.plan.status === "freigegeben", s(r));
  r = await api(mitglied, "PATCH", `/termine/${d2.id}`, { ort: "x" });
  check("Mitglied ändert Termin → 403", r.status === 403, s(r));
  r = await api(planer, "PATCH", `/termine/${d2.id}`, { ort: `${S} nach Freigabe` });
  check("Planer ändert nach der Freigabe (Einzeländerung) → 200", r.status === 200, s(r));
  r = await api(planer, "POST", `/plaene/${JAHR}/generieren`);
  check("Generator auf freigegebenem Plan → 409", r.status === 409, s(r));
  r = await api(admin, "DELETE", `/plaene/${JAHR}`);
  check("Freigegebenen Plan löschen → 409", r.status === 409, s(r));
  r = await api(admin, "PATCH", `/plaene/${JAHR}`, { status: "entwurf" });
  check("Zurück auf Entwurf", r.status === 200 && r.json.plan.status === "entwurf" && r.json.plan.freigegebenAm === null, s(r));
  r = await api(mitglied, "GET", `/plaene/${JAHR}`);
  check("Mitglied sieht den Plan danach nicht mehr", r.status === 404, s(r));
  r = await api(planer, "DELETE", `/plaene/${JAHR}`);
  check("Plan löschen als Planer → 403", r.status === 403, s(r));
  r = await api(admin, "DELETE", `/plaene/${JAHR}`);
  const rest = await owner`select count(*)::int as n from dienstplan.plaene where jahr = ${JAHR}`;
  check("Entwurf löschen als Admin (samt Terminen)", r.status === 200 && rest[0].n === 0, s(r));
} finally {
  try {
    await owner`delete from dienstplan.plaene where jahr = ${JAHR}`;
    await owner`delete from dienstplan.themenbloecke where name like ${S + "%"}`;
    await owner`delete from dienstplan.themen where titel like ${S + "%"}`;
    await owner`delete from dienstplan.externe_personen where organisation like ${S + "%"}`;
    if (ids.ben.length) await owner`delete from core.benutzer where id in ${owner(ids.ben)}`;
    if (ids.kam.length) await owner`delete from core.mitglieder_audit where kamerad_id in ${owner(ids.kam)}`;
    if (ids.kam.length) await owner`delete from core.kameraden where id in ${owner(ids.kam)}`;
    await owner`delete from core.login_attempts where benutzername like ${S.toLowerCase() + "%"}`;
  } catch (e) { console.log("AUFRÄUMEN FEHLGESCHLAGEN:", e.message); fail++; }
  await owner.end({ timeout: 5 });
}
console.log(`\n${ok} OK, ${fail} Fehler`);
process.exit(fail ? 1 : 0);
