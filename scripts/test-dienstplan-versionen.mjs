// Phase 9 Ende zu Ende: Versionen (Spec 8). Manuell speichern, Version bei der
// Freigabe, Liste, Ansehen, Vergleich, Markierung "geändert" (auch für
// Mitglieder), Wiederherstellen (nur Admin, sichert vorher, Plan wird Entwurf,
// Termin-ids bleiben), Rechte je Rolle.
// Testkonten Admin, Planer, Mitglied; Plan 2085.
//
// Aufruf:  node scripts/test-dienstplan-versionen.mjs
// Voraussetzung: Dev-Server (npx next dev --webpack -p 3100) mit derselben Datenbank.
// Env (aus .env.local): MIGRATE_DATABASE_URL (Owner, nur Aufbau/Kontrolle/Aufräumen),
//   TEST_BASE optional, Standard http://localhost:3100
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
const postgres = (await import(pathToFileURL(req.resolve("postgres")).href)).default;
const bcrypt = (await import(pathToFileURL(req.resolve("bcryptjs")).href)).default;
const owner = postgres(process.env.MIGRATE_DATABASE_URL, { max: 1, onnotice: () => {} });

let fail = 0, ok = 0;
const check = (name, cond, extra = "") => {
  if (cond) { ok++; console.log(`OK   ${name}`); }
  else { fail++; console.log(`FEHLER ${name}${extra ? " — " + extra : ""}`); }
};

const S = `dpvs${Date.now().toString(36)}`;
const JAHR = 2085;
const ids = { kam: [], ben: [], plan: [], thema: [] };
let ip = 120;

async function konto(rolle) {
  const [k] = await owner`insert into core.kameraden (name, vorname, dienst_rolle) values (${S + rolle}, 'Vs', ${rolle === "Mitglied" ? null : rolle}) returning id`;
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
  return { status: r.status, json };
}
const s = (r) => `${r.status} ${JSON.stringify(r.json)?.slice(0, 260)}`;

try {
  await owner`delete from dienstplan.plaene where jahr = ${JAHR}`;
  const admin = await konto("Admin"), planer = await konto("Planer"), mitglied = await konto("Mitglied");
  const kat = Object.fromEntries((await owner`select kuerzel, id from dienstplan.kategorien where organisation_id = 1`).map((k) => [k.kuerzel, k.id]));
  const [th1] = await owner`insert into dienstplan.themen (organisation_id, titel) values (1, ${S + " Knoten"}) returning id`;
  const [th2] = await owner`insert into dienstplan.themen (organisation_id, titel) values (1, ${S + " Funk"}) returning id`;
  ids.thema.push(th1.id, th2.id);
  const [p] = await owner`insert into dienstplan.plaene (organisation_id, jahr) values (1, ${JAHR}) returning id`;
  ids.plan.push(p.id);
  const termin = async (datum, themaId) => {
    const [t] = await owner`insert into dienstplan.termine (plan_id, datum, uhrzeit, kategorie_id) values (${p.id}, ${datum}, '19:30', ${kat.D}) returning id`;
    const [tt] = await owner`insert into dienstplan.termin_themen (termin_id, position, thema_id) values (${t.id}, 1, ${themaId}) returning id`;
    await owner`insert into dienstplan.termin_verantwortliche (termin_thema_id, kamerad_id, position) values (${tt.id}, ${planer.kameradId}, 1)`;
    return t.id;
  };
  const a = await termin(`${JAHR}-01-09`, th1.id), b = await termin(`${JAHR}-01-23`, th2.id);

  // ── Rechte ──
  let r = await api(null, "GET", `/plaene/${JAHR}/versionen`);
  check("ohne Anmeldung: Liste → 401", r.status === 401, s(r));
  r = await api(mitglied, "GET", `/plaene/${JAHR}/versionen`);
  check("Mitglied: Liste → 403", r.status === 403, s(r));
  r = await api(mitglied, "POST", `/plaene/${JAHR}/versionen`, { bezeichnung: "x" });
  check("Mitglied: speichern → 403", r.status === 403, s(r));

  // ── Manuell speichern ──
  r = await api(planer, "POST", `/plaene/${JAHR}/versionen`, {});
  check("Planer: ohne Bezeichnung → 400", r.status === 400, s(r));
  r = await api(planer, "POST", `/plaene/${JAHR}/versionen`, { bezeichnung: "Stand nach GF-Sitzung" });
  check("Planer: manuelle Version → 201, Nummer 1", r.status === 201 && r.json.nummer === 1, s(r));
  r = await api(planer, "GET", `/plaene/${JAHR}/versionen`);
  const v1 = r.json?.versionen?.[0];
  check("Liste: Version 1 manuell, Bezeichnung, 2 Termine, Ersteller", r.status === 200 && v1?.anlass === "manuell" && v1.bezeichnung === "Stand nach GF-Sitzung" && v1.anzahlTermine === 2 && v1.erstelltVon === planer.kameradId && typeof v1.erstelltVonName === "string", s(r));

  // ── Freigabe legt Version an ──
  r = await api(planer, "PATCH", `/plaene/${JAHR}`, { status: "freigegeben" });
  check("Planer: freigeben → 403", r.status === 403, s(r));
  r = await api(admin, "PATCH", `/plaene/${JAHR}`, { status: "freigegeben", bezeichnung: "Erste Freigabe" });
  check("Admin: freigeben → 200 mit Version 2", r.status === 200 && r.json.version === 2 && r.json.plan.status === "freigegeben", s(r));
  const [v2db] = await owner`select anlass, bezeichnung, erstellt_von, jsonb_array_length(inhalt->'termine') n,
    inhalt->'termine'->0->'themen'->0->'verantwortliche'->0->>'name' as name from dienstplan.plan_versionen where plan_id = ${p.id} and nummer = 2`;
  check("Version 2: Anlass freigabe, Bezeichnung, Admin, Termine mit Anzeigenamen", v2db?.anlass === "freigabe" && v2db.bezeichnung === "Erste Freigabe" && v2db.erstellt_von === admin.kameradId && v2db.n === 2 && !!v2db.name, JSON.stringify(v2db));

  r = await api(mitglied, "GET", `/plaene/${JAHR}`);
  check("Mitglied: Plan freigegeben, nichts geändert", r.status === 200 && r.json.aenderungen?.freigabeVersion === 2 && r.json.aenderungen.termine.length === 0, s(r));

  // ── Änderungen nach Freigabe ──
  r = await api(planer, "PATCH", `/termine/${b}`, { datum: `${JAHR}-01-30` });
  check("Planer: Termin nach Freigabe verschoben", r.status === 200, s(r));
  r = await api(planer, "POST", `/plaene/${JAHR}/termine`, { datum: `${JAHR}-02-06`, kategorieId: kat.D });
  const c = r.json?.termin?.id ?? r.json?.id;
  check("Planer: neuer Termin nach Freigabe", (r.status === 200 || r.status === 201) && !!c, s(r));
  r = await api(planer, "DELETE", `/termine/${a}`);
  check("Planer: Termin gelöscht", r.status === 200, s(r));
  await owner`update dienstplan.themen set titel = ${S + " Funk und Sprechfunk"} where id = ${th2.id}`;

  r = await api(mitglied, "GET", `/plaene/${JAHR}`);
  check("Mitglied: geändert = verschobener und neuer Termin", r.status === 200 && JSON.stringify([...r.json.aenderungen.termine].sort((x, y) => x - y)) === JSON.stringify([b, c].sort((x, y) => x - y)), s(r));
  r = await api(planer, "GET", `/plaene/${JAHR}/versionen/vergleich`);
  const arten = Object.fromEntries((r.json?.aenderungen ?? []).map((x) => [x.terminId, x.art]));
  check("Vergleich seit Freigabe: verschoben, neu, entfallen (Umbenennung zählt nicht)", r.status === 200 && r.json.von === 2 && r.json.bis === "aktuell" &&
    arten[b] === "verschoben" && arten[c] === "neu" && arten[a] === "entfallen" && r.json.aenderungen.length === 3, s(r));
  check("Vergleich: Zusammenfassung", r.json?.zusammenfassung === "1 neu, 1 entfallen, 1 verschoben", r.json?.zusammenfassung);
  r = await api(planer, "GET", `/plaene/${JAHR}/versionen/vergleich?von=1&bis=2`);
  check("Vergleich Version 1 → 2: keine Änderungen", r.status === 200 && r.json.aenderungen.length === 0 && r.json.zusammenfassung === "keine Änderungen", s(r));
  for (const q of ["von=x", "von=1&bis=0", "von=99"]) {
    r = await api(planer, "GET", `/plaene/${JAHR}/versionen/vergleich?${q}`);
    check(`Vergleich ${q} → ${q === "von=99" ? 404 : 400}`, r.status === (q === "von=99" ? 404 : 400), s(r));
  }
  r = await api(mitglied, "GET", `/plaene/${JAHR}/versionen/vergleich`);
  check("Mitglied: Vergleich → 403", r.status === 403, s(r));

  // ── Ansehen ──
  r = await api(planer, "GET", `/plaene/${JAHR}/versionen/2`);
  const titel = r.json?.version?.inhalt?.termine?.map((t) => t.themen[0]?.titel);
  check("Version 2 ansehen: Titel zum Zeitpunkt (vor der Umbenennung)", r.status === 200 && titel?.includes(S + " Funk") && titel.includes(S + " Knoten"), s(r));
  r = await api(planer, "GET", `/plaene/${JAHR}/versionen/99`);
  check("unbekannte Version → 404", r.status === 404, s(r));
  r = await api(planer, "GET", `/plaene/${JAHR}/versionen/abc`);
  check("ungültige Versionsnummer → 400", r.status === 400, s(r));

  // ── Wiederherstellen ──
  r = await api(planer, "POST", `/plaene/${JAHR}/versionen/2/wiederherstellen`);
  check("Planer: wiederherstellen → 403", r.status === 403, s(r));
  r = await api(admin, "POST", `/plaene/${JAHR}/versionen/2/wiederherstellen`);
  check("Admin: wiederherstellen → 200, gesichert als Version 3, 1 geändert, 1 angelegt, 1 gelöscht",
    r.status === 200 && r.json.gesichert === 3 && r.json.geaendert === 1 && r.json.angelegt === 1 && r.json.geloescht === 1 && r.json.plan.status === "entwurf", s(r));
  const nachher = await owner`select id, datum::text d from dienstplan.termine where plan_id = ${p.id} order by datum`;
  check("nach Wiederherstellen: Termine wie Version 2, verschobener behält seine id", nachher.length === 2 && nachher[0].d === `${JAHR}-01-09` && nachher[1].d === `${JAHR}-01-23` && nachher[1].id === b && nachher[0].id !== a, JSON.stringify(nachher));
  const [vtt] = await owner`select count(*)::int n from dienstplan.termin_verantwortliche v join dienstplan.termin_themen tt on tt.id = v.termin_thema_id
    join dienstplan.termine t on t.id = tt.termin_id where t.plan_id = ${p.id} and v.kamerad_id = ${planer.kameradId}`;
  check("nach Wiederherstellen: Verantwortliche wieder da", vtt.n === 2, JSON.stringify(vtt));
  r = await api(planer, "GET", `/plaene/${JAHR}/versionen`);
  check("keine Version gelöscht: 3 Versionen, neueste 'Vor Wiederherstellung von Version 2'", r.json?.versionen?.length === 3 && r.json.versionen[0].bezeichnung === "Vor Wiederherstellung von Version 2", s(r));
  r = await api(planer, "GET", `/plaene/${JAHR}/versionen/vergleich?von=2`);
  check("Vergleich Version 2 → aktuell nach Wiederherstellen: keine Änderungen", r.status === 200 && r.json.aenderungen.length === 0, s(r));
  r = await api(planer, "GET", `/plaene/${JAHR}/versionen/vergleich?von=3&bis=2`);
  check("Vergleich Version 3 (gesichert) → 2 zeigt die zurückgenommenen Änderungen", r.status === 200 && r.json.aenderungen.length === 3, s(r));
  r = await api(mitglied, "GET", `/plaene/${JAHR}`);
  check("Mitglied: Plan nach Wiederherstellen Entwurf → 404", r.status === 404, s(r));

  // ── Thema im Katalog verschwunden: Wiederherstellen als Freitext ──
  await owner`update dienstplan.termin_themen set thema_id = null, titel_freitext = 'Platzhalter' where thema_id = ${th1.id}`;
  await owner`delete from dienstplan.themen where id = ${th1.id}`;
  ids.thema = ids.thema.filter((x) => x !== th1.id);
  r = await api(admin, "POST", `/plaene/${JAHR}/versionen/2/wiederherstellen`);
  const [ft] = await owner`select tt.titel_freitext from dienstplan.termin_themen tt join dienstplan.termine t on t.id = tt.termin_id where t.plan_id = ${p.id} and t.datum = ${`${JAHR}-01-09`}`;
  check("fehlendes Thema → Freitext mit Titel zum Zeitpunkt, Hinweis", r.status === 200 && ft?.titel_freitext === S + " Knoten" && r.json.hinweise.some((h) => h.includes("als Freitext")), s(r));

  // Versionen sind unveränderlich (Rechte fw_app; hier als Kontrolle über die Tabelle)
  const [{ n: anzahl }] = await owner`select count(*)::int n from dienstplan.plan_versionen where plan_id = ${p.id}`;
  check("insgesamt 4 Versionen (1 manuell, 2 Freigabe, 3 und 4 Sicherungen)", anzahl === 4, String(anzahl));
} finally {
  try {
    if (ids.plan.length) await owner`delete from dienstplan.plaene where id in ${owner(ids.plan)}`;
    if (ids.thema.length) await owner`delete from dienstplan.themen where id in ${owner(ids.thema)}`;
    if (ids.ben.length) await owner`delete from core.benutzer where id in ${owner(ids.ben)}`;
    if (ids.kam.length) await owner`delete from core.mitglieder_audit where kamerad_id in ${owner(ids.kam)}`;
    if (ids.kam.length) await owner`delete from core.kameraden where id in ${owner(ids.kam)}`;
    await owner`delete from core.login_attempts where benutzername like ${S + "%"}`;
    const [rest] = await owner`select
      (select count(*)::int from dienstplan.plaene where jahr = ${JAHR}) p,
      (select count(*)::int from dienstplan.themen where titel like ${S + "%"}) t,
      (select count(*)::int from core.kameraden where name like ${S + "%"}) k`;
    console.log(`Aufräumen: Rest ${rest.p} Pläne, ${rest.t} Themen, ${rest.k} Kameraden`);
    if (rest.p + rest.t + rest.k > 0) fail++;
  } catch (e) { console.log("AUFRÄUMEN FEHLGESCHLAGEN:", e.message); fail++; }
  await owner.end({ timeout: 5 });
}
console.log(`\n${ok} OK, ${fail} Fehler`);
process.exit(fail ? 1 : 0);
