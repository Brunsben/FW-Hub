// Phase 7 Ende zu Ende: Termin-Zustand (Rückgängig/Wiederholen), Kopieren einer
// Themenposition (Alt beim Ziehen), Datum ändern (Monatsraster), Reihenfolge
// und Verschieben an eine Position (Drag and Drop), Vorjahresanzeige in der
// Plan-Route und in der Token-Route.
// Testkonten Planer und Mitglied, Pläne 2088 (Vorjahr, freigegeben) und 2089.
//
// Aufruf:  node scripts/test-dienstplan-rueckgaengig.mjs
// Voraussetzung: Dev-Server (npx next dev --webpack -p 3100) mit derselben Datenbank.
// Env (aus .env.local): MIGRATE_DATABASE_URL (Owner, nur Aufbau/Kontrolle/Aufräumen),
//   TEST_BASE optional, Standard http://localhost:3100
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { schutz } from "./lib/schutz.mjs";
import { zustandVon } from "../src/lib/dienstplan/rueckgaengig.ts";

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

const S = `dprg${Date.now().toString(36)}`;
const VJ = 2088, JAHR = 2089;
const ids = { kam: [], ben: [], plan: [], thema: [], extern: [] };
let ip = 60;
// Status ändern als Owner: Der Trigger plaene_schutz verlangt app.dienst_rolle = 'Admin'.
const setzeStatus = (id, status) => owner.begin(async (tx) => {
  await tx`select set_config('app.dienst_rolle', 'Admin', true)`;
  await tx`update dienstplan.plaene set status = ${status}::dienstplan.plan_status where id = ${id}`;
});

async function konto(rolle) {
  const [k] = await owner`insert into core.kameraden (name, vorname, dienst_rolle) values (${S + rolle}, 'Rg', ${rolle === "Mitglied" ? null : rolle}) returning id`;
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
async function api(wer, methode, pfad, body, headers = {}) {
  const r = await fetch(`${BASE}/api/dienstplan${pfad}`, {
    method: methode,
    headers: { ...(wer ? { cookie: wer.cookie } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* kein JSON */ }
  return { status: r.status, json };
}
const s = (r) => `${r.status} ${JSON.stringify(r.json)?.slice(0, 220)}`;

try {
  await owner`delete from dienstplan.plaene where jahr in (${VJ}, ${JAHR})`;
  const planer = await konto("Planer"), mitglied = await konto("Mitglied");
  const kat = Object.fromEntries((await owner`select kuerzel, id from dienstplan.kategorien where organisation_id = 1`).map((k) => [k.kuerzel, k.id]));
  const [th1] = await owner`insert into dienstplan.themen (organisation_id, titel) values (1, ${S + " Knoten"}) returning id`;
  const [th2] = await owner`insert into dienstplan.themen (organisation_id, titel) values (1, ${S + " Funk"}) returning id`;
  ids.thema.push(th1.id, th2.id);
  const [ext] = await owner`insert into dienstplan.externe_personen (organisation_id, organisation) values (1, ${S + " DRK"}) returning id`;
  ids.extern.push(ext.id);
  const plan = async (jahr, status) => {
    const [p] = await owner`insert into dienstplan.plaene (organisation_id, jahr, status) values (1, ${jahr}, ${status}) returning id`;
    ids.plan.push(p.id); return p.id;
  };
  const pVJ = await plan(VJ, "freigegeben"), pJ = await plan(JAHR, "entwurf");
  const termin = async (planId, datum, k = "D") => (await owner`insert into dienstplan.termine (plan_id, datum, kategorie_id) values (${planId}, ${datum}, ${kat[k]}) returning id`)[0].id;
  // Vorjahr: 2088-01-06 (Di) mit zwei Themen; 2089-01-05 = 2088-01-06 + 364
  const vt = await termin(pVJ, `${VJ}-01-06`);
  await owner`insert into dienstplan.termin_themen (termin_id, position, thema_id) values (${vt}, 1, ${th1.id}), (${vt}, 2, ${th2.id})`;
  const a = await termin(pJ, `${JAHR}-01-05`), b = await termin(pJ, `${JAHR}-01-19`);

  // ── Vorjahr in der Plan-Route ──
  let r = await api(planer, "GET", `/plaene/${JAHR}`);
  check("Plan-Route: Vorjahr zugeordnet (gleicher Platz, 364 Tage)", r.status === 200 && r.json.vorjahr?.jahr === VJ
    && JSON.stringify(r.json.vorjahr.termine[a]?.titel) === JSON.stringify([S + " Knoten", S + " Funk"]), s(r));
  check("Plan-Route: ohne Treffer keine Zuordnung", r.json.vorjahr.termine[b] === undefined);

  // ── Aufbau über die API: Thema, Person ──
  r = await api(planer, "POST", `/termine/${a}/themen`, { themaId: th1.id });
  const posA = r.json.ids[0];
  await api(planer, "POST", `/termin-themen/${posA}/verantwortliche`, { kameradId: planer.kameradId });
  await api(planer, "POST", `/termin-themen/${posA}/verantwortliche`, { externePersonId: ext.id });
  r = await api(planer, "POST", `/termine/${a}/themen`, { titelFreitext: "Grillen" });
  r = await api(planer, "GET", `/plaene/${JAHR}`);
  const vorher = r.json.termine.find((t) => t.id === a);
  const zVorher = zustandVon(vorher);
  check("Aufbau: zwei Themen, zwei Verantwortliche", vorher.themen.length === 2 && vorher.themen[0].verantwortliche.length === 2);

  // ── Kopieren (Alt beim Ziehen) ──
  r = await api(planer, "POST", `/termin-themen/${posA}/kopie`, { terminId: b });
  check("Kopie: Thema samt Verantwortlichen in anderen Termin", r.status === 201, s(r));
  r = await api(planer, "GET", `/plaene/${JAHR}`);
  const tb = r.json.termine.find((t) => t.id === b), ta = r.json.termine.find((t) => t.id === a);
  check("Kopie: Ziel hat Thema mit beiden Verantwortlichen, Quelle unverändert",
    tb.themen.length === 1 && tb.themen[0].themaId === th1.id && tb.themen[0].verantwortliche.length === 2 && ta.themen.length === 2);
  r = await api(planer, "POST", `/termin-themen/${posA}/kopie`, { terminId: b, position: 1 });
  r = await api(planer, "GET", `/plaene/${JAHR}`);
  check("Kopie mit position: steht vorne", r.json.termine.find((t) => t.id === b).themen.length === 2);
  r = await api(mitglied, "POST", `/termin-themen/${posA}/kopie`, { terminId: b });
  check("Kopie als Mitglied → 403", r.status === 403, s(r));
  r = await api(planer, "POST", `/termin-themen/${posA}/kopie`, {});
  check("Kopie ohne terminId → 400", r.status === 400, s(r));
  const fremd = await termin(pVJ, `${VJ}-02-03`);
  r = await api(planer, "POST", `/termin-themen/${posA}/kopie`, { terminId: fremd });
  check("Kopie in anderen Plan → 400", r.status === 400, s(r));

  // ── Verschieben an eine Position (Drag auf ein Thema) und Reihenfolge ──
  const posB = r.json ? (await api(planer, "GET", `/plaene/${JAHR}`)).json.termine.find((t) => t.id === b).themen : [];
  const freitext = ta.themen[1].id;
  r = await api(planer, "PATCH", `/termin-themen/${freitext}`, { terminId: b, position: 1 });
  r = await api(planer, "GET", `/plaene/${JAHR}`);
  const nb = r.json.termine.find((t) => t.id === b).themen;
  check("Verschieben auf Position 1 eines anderen Termins", nb[0].titel === "Grillen" && nb.length === posB.length + 1, JSON.stringify(nb.map((x) => x.titel)));
  r = await api(planer, "PATCH", `/termin-themen/${freitext}`, { position: 3 });
  r = await api(planer, "GET", `/plaene/${JAHR}`);
  check("Reihenfolge im selben Termin", r.json.termine.find((t) => t.id === b).themen[2].titel === "Grillen");

  // ── Datum ändern (Monatsraster) ──
  r = await api(planer, "PATCH", `/termine/${b}`, { datum: `${JAHR}-01-20` });
  check("Datum ändern", r.status === 200, s(r));
  r = await api(planer, "PATCH", `/termine/${b}`, { datum: `${VJ}-12-30` });
  check("Datum außerhalb des Planjahres → 400", r.status === 400, s(r));

  // ── Zustand (Rückgängig) ──
  r = await api(planer, "GET", `/plaene/${JAHR}`);
  const jetztA = r.json.termine.find((t) => t.id === a);
  r = await api(planer, "PUT", `/termine/${a}/zustand`, { zustand: zVorher, erwartet: "2000-01-01T00:00:00.000Z" });
  check("Zustand mit falschem erwartet-Stempel → 409", r.status === 409, s(r));
  r = await api(planer, "PUT", `/termine/${a}/zustand`, { zustand: zVorher, erwartet: jetztA.aktualisiertAm });
  check("Zustand wiederherstellen → 200", r.status === 200, s(r));
  r = await api(planer, "GET", `/plaene/${JAHR}`);
  const wieder = r.json.termine.find((t) => t.id === a);
  check("Zustand: Themen, Reihenfolge und Verantwortliche wie vorher",
    JSON.stringify(zustandVon(wieder)) === JSON.stringify(zVorher), JSON.stringify(zustandVon(wieder)).slice(0, 200));
  r = await api(planer, "PUT", `/termine/${a}/zustand`, { zustand: { ...zVorher, datum: `${VJ}-01-05` } });
  check("Zustand mit Datum außerhalb des Planjahres → 400", r.status === 400, s(r));
  r = await api(planer, "PUT", `/termine/${a}/zustand`, { zustand: { ...zVorher, themen: [{ themaId: 999999999, verantwortliche: [] }] } });
  check("Zustand mit unbekanntem Thema → 400", r.status === 400, s(r));
  r = await api(planer, "PUT", `/termine/${a}/zustand`, { zustand: { ...zVorher, themen: [{ titelFreitext: "x", verantwortliche: [{ kameradId: 999999999 }] }] } });
  check("Zustand mit unbekanntem Kameraden → 400", r.status === 400, s(r));
  r = await api(planer, "PUT", `/termine/${a}/zustand`, { zustand: { ...zVorher, themen: [{ titelFreitext: "Alt", verantwortliche: [{ platzhalter: "alle_gf" }] }] } });
  check("Zustand mit Platzhalter (Altdaten) erlaubt", r.status === 200, s(r));
  r = await api(mitglied, "PUT", `/termine/${a}/zustand`, { zustand: zVorher });
  check("Zustand als Mitglied → 403", r.status === 403, s(r));
  r = await api(null, "PUT", `/termine/${a}/zustand`, { zustand: zVorher });
  check("Zustand ohne Anmeldung → 401", r.status === 401, s(r));
  const [{ v: v0 }] = await owner`select version v from dienstplan.plaene where id = ${pJ}`;
  r = await api(planer, "PUT", `/termine/${a}/zustand`, { zustand: zVorher });
  const [{ v: v1 }] = await owner`select version v from dienstplan.plaene where id = ${pJ}`;
  check("Zustand erhöht die Version (Präsentation sieht die Änderung)", v1 > v0, `${v0} -> ${v1}`);

  // Gelöschten manuellen Termin wiederherstellen: anlegen + Zustand
  r = await api(planer, "POST", `/plaene/${JAHR}/termine`, { datum: `${JAHR}-02-02`, kategorieId: kat.K, bemerkung: "Feier" });
  const m = r.json.id;
  await api(planer, "POST", `/termine/${m}/themen`, { titelFreitext: "Grünkohl" });
  const zm = zustandVon((await api(planer, "GET", `/plaene/${JAHR}`)).json.termine.find((t) => t.id === m));
  r = await api(planer, "DELETE", `/termine/${m}`);
  r = await api(planer, "POST", `/plaene/${JAHR}/termine`, { datum: zm.datum, kategorieId: zm.kategorieId, bemerkung: zm.bemerkung });
  const m2 = r.json.id;
  r = await api(planer, "PUT", `/termine/${m2}/zustand`, { zustand: zm });
  const m2z = zustandVon((await api(planer, "GET", `/plaene/${JAHR}`)).json.termine.find((t) => t.id === m2));
  check("Gelöschter Termin: neu angelegt mit gleichem Zustand", r.status === 200 && JSON.stringify(m2z) === JSON.stringify(zm), s(r));

  // ── Vorjahr in der Token-Route und für Mitglieder ──
  r = await api(planer, "POST", `/plaene/${JAHR}/anzeige`);
  const tok = r.json.token;
  r = await api(null, "GET", `/anzeige/${JAHR}`, undefined, { "x-dienstplan-anzeige": tok });
  check("Token-Route: Vorjahrestitel enthalten (Vorjahr freigegeben)", r.status === 200 && r.json.vorjahr?.termine[a]?.titel.length === 2, s(r));
  check("Token-Route: Vorjahr ohne Namen", !JSON.stringify(r.json.vorjahr).includes(S + "Planer"));
  await setzeStatus(pVJ, 'entwurf');
  r = await api(null, "GET", `/anzeige/${JAHR}`, undefined, { "x-dienstplan-anzeige": tok });
  check("Token-Route: Vorjahr im Entwurf wird nicht gezeigt", r.status === 200 && Object.keys(r.json.vorjahr.termine).length === 0, s(r));
  r = await api(planer, "GET", `/plaene/${JAHR}`);
  check("Planer: Vorjahr im Entwurf wird gezeigt", Object.keys(r.json.vorjahr.termine).length > 0);
  await setzeStatus(pJ, 'freigegeben');
  r = await api(mitglied, "GET", `/plaene/${JAHR}`);
  check("Mitglied (Plan freigegeben, Vorjahr Entwurf): keine Vorjahresthemen", r.status === 200 && Object.keys(r.json.vorjahr.termine).length === 0, s(r));
} catch (e) {
  fail++;
  console.log("FEHLER Ablauf:", e.message);
} finally {
  try {
    if (ids.plan.length) await owner`delete from dienstplan.plaene where id in ${owner(ids.plan)}`;
    if (ids.thema.length) await owner`delete from dienstplan.themen where id in ${owner(ids.thema)}`;
    if (ids.extern.length) await owner`delete from dienstplan.externe_personen where id in ${owner(ids.extern)}`;
    if (ids.ben.length) await owner`delete from core.benutzer where id in ${owner(ids.ben)}`;
    if (ids.kam.length) await owner`delete from core.mitglieder_audit where kamerad_id in ${owner(ids.kam)}`;
    if (ids.kam.length) await owner`delete from core.kameraden where id in ${owner(ids.kam)}`;
    await owner`delete from core.login_attempts where benutzername like ${S + "%"}`;
    const [rest] = await owner`select
      (select count(*)::int from dienstplan.plaene where jahr in (${VJ}, ${JAHR})) p,
      (select count(*)::int from dienstplan.themen where titel like ${S + "%"}) t,
      (select count(*)::int from core.kameraden where name like ${S + "%"}) k`;
    console.log(`Aufräumen: Rest ${rest.p} Pläne, ${rest.t} Themen, ${rest.k} Kameraden`);
    if (rest.p + rest.t + rest.k > 0) fail++;
  } catch (e) { console.log("AUFRÄUMEN FEHLGESCHLAGEN:", e.message); fail++; }
  await owner.end({ timeout: 5 });
}
console.log(`\n${ok} OK, ${fail} Fehler`);
process.exit(fail ? 1 : 0);
