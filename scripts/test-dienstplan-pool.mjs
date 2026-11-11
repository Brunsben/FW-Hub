// Phase 8 Ende zu Ende: Themenpool (einreichen, sehen, verwerfen, übernehmen
// mit und ohne Termin), Ausgleichsliste (pflegen, Rechte) und Zählung je Plan
// samt Vorjahr, Pflichtthemen-Vorschlag, Mitgliederseite /dienstplan.
// Testkonten Admin, Planer, Mitglied; Pläne 2086 (Vorjahr) und 2087.
// Der Pflichtthemen-Vorschlag ändert den Katalog: Der Test merkt sich vorher
// pflicht_jaehrlich/zielgruppe/aktiv aller Themen und stellt sie danach her.
//
// Aufruf:  node scripts/test-dienstplan-pool.mjs
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

const S = `dppool${Date.now().toString(36)}`;
const VJ = 2086, JAHR = 2087;
const ids = { kam: [], ben: [], plan: [] };
let ip = 70;

async function konto(rolle) {
  const [k] = await owner`insert into core.kameraden (name, vorname, dienst_rolle) values (${S + rolle}, 'Pool', ${rolle === "Mitglied" ? null : rolle}) returning id`;
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
const s = (r) => `${r.status} ${JSON.stringify(r.json)?.slice(0, 220)}`;

const themenVorher = await owner`select id, pflicht_jaehrlich, zielgruppe, aktiv from dienstplan.themen where organisation_id = 1`;
const themenIdsVorher = new Set(themenVorher.map((t) => t.id));
try {
  await owner`delete from dienstplan.plaene where jahr in (${VJ}, ${JAHR})`;
  const admin = await konto("Admin"), planer = await konto("Planer"), mitglied = await konto("Mitglied");
  const [gf1] = await owner`insert into core.kameraden (name, vorname) values (${S + "Gf1"}, 'A') returning id`;
  const [gf2] = await owner`insert into core.kameraden (name, vorname) values (${S + "Gf2"}, 'B') returning id`;
  const [alt] = await owner`insert into core.kameraden (name, vorname, aktiv) values (${S + "Alt"}, 'C', false) returning id`;
  ids.kam.push(gf1.id, gf2.id, alt.id);
  const kat = Object.fromEntries((await owner`select kuerzel, id from dienstplan.kategorien where organisation_id = 1`).map((k) => [k.kuerzel, k.id]));

  // ── Pool ──
  let r = await api(mitglied, "POST", "/themenvorschlaege", { titel: `${S} Neue Drehleiter`, beschreibung: "nach Einsatz" });
  check("Mitglied reicht Vorschlag ein", r.status === 201, s(r));
  const v1 = r.json.id;
  r = await api(planer, "POST", "/themenvorschlaege", { titel: `${S} Vorschlag Planer` });
  const v2 = r.json.id;
  r = await api(mitglied, "POST", "/themenvorschlaege", { titel: " " });
  check("Vorschlag ohne Titel → 400", r.status === 400, s(r));
  r = await api(null, "POST", "/themenvorschlaege", { titel: "x" });
  check("Vorschlag ohne Anmeldung → 401", r.status === 401, s(r));
  r = await api(mitglied, "GET", "/themenvorschlaege");
  const sichtM = r.json.vorschlaege.map((v) => v.id);
  check("Mitglied sieht nur eigene Vorschläge", sichtM.includes(v1) && !sichtM.includes(v2), JSON.stringify(sichtM));
  r = await api(planer, "GET", "/themenvorschlaege?status=offen");
  const vp = r.json.vorschlaege.find((v) => v.id === v1);
  check("Planer sieht alle offenen mit Einreicher", vp && r.json.vorschlaege.some((v) => v.id === v2) && vp.einreicher.length > 0 && vp.eigen === false, s(r));
  r = await api(planer, "GET", "/themenvorschlaege?eigene=1");
  check("Planer: ?eigene=1 nur die eigenen", r.json.vorschlaege.every((v) => v.eigen) && r.json.vorschlaege.some((v) => v.id === v2));
  r = await api(mitglied, "PATCH", `/themenvorschlaege/${v1}`, { status: "verworfen" });
  check("Mitglied verwirft → 403", r.status === 403, s(r));
  r = await api(planer, "PATCH", `/themenvorschlaege/${v2}`, { status: "verworfen" });
  check("Planer verwirft", r.status === 200, s(r));
  r = await api(planer, "POST", `/themenvorschlaege/${v2}/uebernehmen`, {});
  check("Verworfenen übernehmen → 409", r.status === 409, s(r));
  r = await api(planer, "PATCH", `/themenvorschlaege/${v2}`, { status: "offen" });
  check("Planer öffnet wieder", r.status === 200, s(r));

  const [pv] = await owner`insert into dienstplan.plaene (organisation_id, jahr) values (1, ${VJ}) returning id`;
  const [pj] = await owner`insert into dienstplan.plaene (organisation_id, jahr) values (1, ${JAHR}) returning id`;
  ids.plan.push(pv.id, pj.id);
  const termin = async (planId, datum, k = "D", ausgefallen = false) =>
    (await owner`insert into dienstplan.termine (plan_id, datum, kategorie_id, ausgefallen) values (${planId}, ${datum}, ${kat[k]}, ${ausgefallen}) returning id`)[0].id;
  const t1 = await termin(pj.id, `${JAHR}-01-06`);

  r = await api(mitglied, "POST", `/themenvorschlaege/${v1}/uebernehmen`, { terminId: t1 });
  check("Mitglied übernimmt → 403", r.status === 403, s(r));
  r = await api(planer, "POST", `/themenvorschlaege/${v1}/uebernehmen`, { terminId: t1 });
  check("Übernehmen mit Termin: neues Thema, Position am Termin", r.status === 201 && r.json.neuesThema && r.json.terminThemaId, s(r));
  const [th] = await owner`select id, titel, notizen from dienstplan.themen where id = ${r.json.themaId}`;
  const [vz] = await owner`select status::text as status, thema_id from dienstplan.themenvorschlaege where id = ${v1}`;
  check("Thema aus Vorschlag (Beschreibung → Notizen), Vorschlag übernommen mit Verweis",
    th.titel === `${S} Neue Drehleiter` && th.notizen === "nach Einsatz" && vz.status === "uebernommen" && vz.thema_id === th.id);
  r = await api(planer, "POST", `/themenvorschlaege/${v1}/uebernehmen`, {});
  check("Zweimal übernehmen → 409", r.status === 409, s(r));
  await owner`update dienstplan.themen set aktiv = false where id = ${th.id}`;
  r = await api(mitglied, "POST", "/themenvorschlaege", { titel: `${S} NEUE DREHLEITER` });
  const v3 = r.json.id;
  r = await api(planer, "POST", `/themenvorschlaege/${v3}/uebernehmen`, {});
  const [th2] = await owner`select aktiv from dienstplan.themen where id = ${th.id}`;
  check("Gleicher Titel (anders geschrieben): vorhandenes Thema, wieder aktiv", r.status === 201 && !r.json.neuesThema && r.json.themaId === th.id && th2.aktiv, s(r));
  r = await api(mitglied, "GET", "/themenvorschlaege?eigene=1");
  check("Mitglied sieht Status seiner Vorschläge", r.json.vorschlaege.find((v) => v.id === v1)?.status === "uebernommen");

  // ── Ausgleichsliste ──
  r = await api(planer, "POST", "/ausgleich", { kameradId: gf1.id });
  check("Planer pflegt Ausgleichsliste nicht → 403", r.status === 403, s(r));
  r = await api(admin, "POST", "/ausgleich", { kameradId: gf1.id });
  check("Admin nimmt Person auf", r.status === 201, s(r));
  await api(admin, "POST", "/ausgleich", { kameradId: gf2.id });
  r = await api(admin, "POST", "/ausgleich", { kameradId: gf1.id });
  check("Doppelt → 409", r.status === 409, s(r));
  r = await api(admin, "POST", "/ausgleich", { kameradId: alt.id });
  check("Inaktiver Kamerad → 400", r.status === 400, s(r));
  r = await api(planer, "GET", "/ausgleich");
  check("Planer liest Liste mit Namen", r.status === 200 && r.json.personen.some((p) => p.kameradId === gf1.id && p.name), s(r));
  r = await api(mitglied, "GET", "/ausgleich");
  check("Mitglied liest Liste nicht → 403", r.status === 403, s(r));

  // Zählung: gf1 zweimal in D, einmal in K (zählt nicht), einmal ausgefallen (zählt nicht); gf2 einmal in Z; Vorjahr gf2 dreimal
  const tt = async (terminId, ...kameraden) => {
    const [x] = await owner`insert into dienstplan.termin_themen (termin_id, position, titel_freitext)
      values (${terminId}, (select coalesce(max(position),0)+1 from dienstplan.termin_themen where termin_id = ${terminId}), 'x') returning id`;
    for (const [i, k] of kameraden.entries()) await owner`insert into dienstplan.termin_verantwortliche (termin_thema_id, position, kamerad_id) values (${x.id}, ${i + 1}, ${k})`;
  };
  await tt(t1, gf1.id); await tt(t1, gf1.id);
  await tt(await termin(pj.id, `${JAHR}-01-10`, "K"), gf1.id);
  await tt(await termin(pj.id, `${JAHR}-01-20`, "D", true), gf1.id);
  await tt(await termin(pj.id, `${JAHR}-01-13`, "Z"), gf2.id);
  const tv = await termin(pv.id, `${VJ}-01-07`);
  await tt(tv, gf2.id); await tt(tv, gf2.id); await tt(tv, gf2.id);
  r = await api(planer, "GET", `/plaene/${JAHR}/ausgleich`);
  const z1 = r.json?.personen.find((p) => p.kameradId === gf1.id), z2 = r.json?.personen.find((p) => p.kameradId === gf2.id);
  check("Ausgleich je Plan: K und ausgefallene zählen nicht", z1?.anzahl === 2 && z2?.anzahl === 1, s(r));
  check("Ausgleich je Plan: Vorjahr gezählt", r.json.vorjahr === VJ && z2?.vorjahr === 3 && z1?.vorjahr === 0, s(r));
  r = await api(mitglied, "GET", `/plaene/${JAHR}/ausgleich`);
  check("Ausgleich je Plan als Mitglied → 403", r.status === 403, s(r));
  r = await api(admin, "DELETE", `/ausgleich/${gf2.id}`);
  check("Admin nimmt Person heraus", r.status === 200, s(r));
  r = await api(admin, "DELETE", `/ausgleich/${gf2.id}`);
  check("Nicht (mehr) in der Liste → 404", r.status === 404, s(r));

  // ── Pflichtthemen-Vorschlag ──
  r = await api(mitglied, "POST", "/themen/pflicht-vorschlag");
  check("Pflicht-Vorschlag als Mitglied → 403", r.status === 403, s(r));
  r = await api(planer, "POST", "/themen/pflicht-vorschlag");
  check("Pflicht-Vorschlag: drei Themen markiert bzw. angelegt", r.status === 200 && r.json.themen.length === 3, s(r));
  const erst = JSON.stringify(r.json.themen.map((t) => t.themaId));
  r = await api(planer, "POST", "/themen/pflicht-vorschlag");
  check("Pflicht-Vorschlag ist idempotent (gleiche Themen, nichts neu)", JSON.stringify(r.json.themen.map((t) => t.themaId)) === erst && r.json.themen.every((t) => !t.neu), s(r));
  r = await api(planer, "GET", `/plaene/${JAHR}`);
  const ph = r.json.hinweise.filter((h) => h.art === "pflichtthema").map((h) => h.text);
  check("Hinweis nennt fehlende Pflichtthemen mit Zielgruppe", ph.length >= 3 && ph.some((t) => t.includes("(Atemschutzgeräteträger)")), JSON.stringify(ph));

  // ── Mitgliederseite ──
  let seite = await fetch(`${BASE}/dienstplan`, { redirect: "manual" });
  check("/dienstplan ohne Anmeldung → Weiterleitung zum Login", seite.status >= 300 && seite.status < 400 && (seite.headers.get("location") || "").includes("/login"), String(seite.status));
  seite = await fetch(`${BASE}/dienstplan`, { headers: { cookie: mitglied.cookie }, redirect: "manual" });
  const html = await seite.text();
  check("/dienstplan als Mitglied lädt (mit Vorschlagsformular)", seite.status === 200 && html.includes("Themenvorschlag einreichen"), String(seite.status));
} catch (e) {
  fail++;
  console.log("FEHLER Ablauf:", e.message);
} finally {
  try {
    if (ids.plan.length) await owner`delete from dienstplan.plaene where id in ${owner(ids.plan)}`;
    await owner`delete from dienstplan.themenvorschlaege where titel like ${S + "%"}`;
    if (ids.kam.length) await owner`delete from dienstplan.ausgleich_personen where kamerad_id in ${owner(ids.kam)}`;
    // Katalog wiederherstellen: neue Themen weg (Test + Pflicht-Vorschlag), alte Werte zurück
    const neu = (await owner`select id from dienstplan.themen where organisation_id = 1`).map((t) => t.id).filter((id) => !themenIdsVorher.has(id));
    if (neu.length) await owner`delete from dienstplan.themen where id in ${owner(neu)}`;
    for (const t of themenVorher) {
      await owner`update dienstplan.themen set pflicht_jaehrlich = ${t.pflicht_jaehrlich}, zielgruppe = ${t.zielgruppe}, aktiv = ${t.aktiv}
        where id = ${t.id} and (pflicht_jaehrlich, zielgruppe, aktiv) is distinct from (${t.pflicht_jaehrlich}, ${t.zielgruppe}, ${t.aktiv})`;
    }
    if (ids.ben.length) await owner`delete from core.benutzer where id in ${owner(ids.ben)}`;
    if (ids.kam.length) await owner`delete from core.mitglieder_audit where kamerad_id in ${owner(ids.kam)}`;
    if (ids.kam.length) await owner`delete from core.kameraden where id in ${owner(ids.kam)}`;
    await owner`delete from core.login_attempts where benutzername like ${S + "%"}`;
    const [rest] = await owner`select
      (select count(*)::int from dienstplan.plaene where jahr in (${VJ}, ${JAHR})) p,
      (select count(*)::int from dienstplan.themen where organisation_id = 1) t,
      (select count(*)::int from dienstplan.themen where pflicht_jaehrlich) pf,
      (select count(*)::int from core.kameraden where name like ${S + "%"}) k`;
    const pflichtVorher = themenVorher.filter((t) => t.pflicht_jaehrlich).length;
    console.log(`Aufräumen: Rest ${rest.p} Pläne, ${rest.k} Kameraden; Themen ${rest.t} (vorher ${themenVorher.length}), Pflicht ${rest.pf} (vorher ${pflichtVorher})`);
    if (rest.p + rest.k > 0 || rest.t !== themenVorher.length || rest.pf !== pflichtVorher) fail++;
  } catch (e) { console.log("AUFRÄUMEN FEHLGESCHLAGEN:", e.message); fail++; }
  await owner.end({ timeout: 5 });
}
console.log(`\n${ok} OK, ${fail} Fehler`);
process.exit(fail ? 1 : 0);
