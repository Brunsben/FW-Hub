// Präsentation (Phase 6) Ende zu Ende: Anzeige-Links erzeugen, lesen, beenden;
// Token-Route mit abgelaufenem, falschem und fremdem Token; ETag/304, Fokus,
// keine Notizen, keine Schreibrechte mit Token, Seite ohne Portalrahmen.
// Testkonten Planer und Mitglied, Pläne 2096 und 2097 (Aufräumen über gemerkte
// IDs und die Jahre).
//
// Aufruf:  node scripts/test-dienstplan-anzeige.mjs
// Voraussetzung: Dev-Server (npx next dev --webpack -p 3100) mit derselben Datenbank.
// Env (aus .env.local): MIGRATE_DATABASE_URL (Owner, nur Aufbau/Kontrolle/Aufräumen),
//   TEST_BASE optional, Standard http://localhost:3100
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { schutz } from "./lib/schutz.mjs";
import { ansichtAus, geaenderteTermine, halbjahrVon, monateDerAnsicht } from "../src/lib/dienstplan/praesentation.ts";

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

// ── Reine Hilfsfunktionen ────────────────────────────────────────────────────
check("Ansicht: Parameter hat Vorrang", ansichtAus("jahr", 2027, "2026-11-11") === "jahr" && ansichtAus("h2", 2027, "2026-11-11") === "h2");
check("Ansicht: Planung des Folgejahres → 1. Halbjahr", ansichtAus(null, 2027, "2026-11-11") === "h1");
check("Ansicht: laufendes Jahr ab Juli → 2. Halbjahr", ansichtAus(null, 2026, "2026-11-11") === "h2" && ansichtAus("quatsch", 2026, "2026-03-01") === "h1");
check("Ansicht: Monate je Ansicht", monateDerAnsicht("h1").join() === "0,1,2,3,4,5" && monateDerAnsicht("h2")[0] === 6 && monateDerAnsicht("jahr").length === 12);
check("Halbjahr eines Datums", halbjahrVon("2027-06-30") === "h1" && halbjahrVon("2027-07-01") === "h2");
check("Geändert: erster Abruf markiert nichts", geaenderteTermine(null, [{ id: 1, aktualisiertAm: "a" }]).length === 0);
check("Geändert: neu und geändert, unverändert nicht",
  geaenderteTermine([{ id: 1, aktualisiertAm: "a" }, { id: 2, aktualisiertAm: "b" }], [{ id: 1, aktualisiertAm: "a" }, { id: 2, aktualisiertAm: "c" }, { id: 3, aktualisiertAm: "d" }]).join() === "2,3");

const S = `dpanz${Date.now().toString(36)}`;
const JAHR = 2096, ANDERES = 2097;
const ids = { kam: [], ben: [], plan: [] };
let ip = 40;

async function konto(rolle) {
  const [k] = await owner`insert into core.kameraden (name, vorname, dienst_rolle) values (${S + rolle}, 'Anz', ${rolle === "Mitglied" ? null : rolle}) returning id`;
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
  return { status: r.status, json, etag: r.headers.get("etag"), text };
}
const s = (r) => `${r.status} ${JSON.stringify(r.json)?.slice(0, 200)}`;
const anzeige = (token, jahr = JAHR, extra = {}) => api(null, "GET", `/anzeige/${jahr}`, undefined, { "x-dienstplan-anzeige": token, ...extra });

try {
  await owner`delete from dienstplan.plaene where jahr in (${JAHR}, ${ANDERES})`;
  const planer = await konto("Planer"), mitglied = await konto("Mitglied");
  const [{ id: katD }] = await owner`select id from dienstplan.kategorien where organisation_id = 1 and kuerzel = 'D'`;
  const plaene = {};
  for (const j of [JAHR, ANDERES]) {
    const [p] = await owner`insert into dienstplan.plaene (organisation_id, jahr) values (1, ${j}) returning id`;
    ids.plan.push(p.id); plaene[j] = p.id;
  }
  const [t1] = await owner`insert into dienstplan.termine (plan_id, datum, kategorie_id, notizen, bemerkung) values (${plaene[JAHR]}, ${`${JAHR}-01-08`}, ${katD}, 'geheime Notiz', 'Halle') returning id`;
  const [t2] = await owner`insert into dienstplan.termine (plan_id, datum, kategorie_id) values (${plaene[JAHR]}, ${`${JAHR}-07-08`}, ${katD}) returning id`;

  // ── Links verwalten ──
  let r = await api(mitglied, "POST", `/plaene/${JAHR}/anzeige`);
  check("Mitglied: Anzeige-Link erzeugen → 403", r.status === 403, s(r));
  r = await api(null, "POST", `/plaene/${JAHR}/anzeige`);
  check("Ohne Anmeldung: Anzeige-Link erzeugen → 401", r.status === 401, s(r));
  r = await api(planer, "POST", `/plaene/${JAHR}/anzeige`);
  check("Planer: Anzeige-Link erzeugen → 201 mit Token", r.status === 201 && /^[A-Za-z0-9_-]{43}$/.test(r.json?.token ?? ""), s(r));
  const token = r.json.token;
  const stunden = (new Date(r.json.gueltigBis) - Date.now()) / 3600e3;
  check("Link gilt 12 Stunden", stunden > 11.9 && stunden <= 12.01, String(stunden));
  const [db] = await owner`select token_hash from dienstplan.anzeige_tokens where id = ${r.json.id}`;
  check("In der Datenbank steht nur der Hash, nicht das Token", db.token_hash.length === 64 && db.token_hash !== token);
  r = await api(planer, "GET", `/plaene/${JAHR}/anzeige`);
  check("Planer: aktive Links ohne Token gelistet", r.status === 200 && r.json.links.length === 1 && !JSON.stringify(r.json).includes(token), s(r));

  // ── Lesen mit Token ──
  r = await anzeige(token);
  check("Token: Plan lesen → 200", r.status === 200 && r.json.plan.jahr === JAHR && r.json.termine.length === 2, s(r));
  check("Token: ohne Notizen, Bemerkung bleibt", r.json.termine.every((t) => t.notizen === null) && !r.text.includes("geheime Notiz") && r.json.termine[0].bemerkung === "Halle");
  check("Token: gueltigBis in der Antwort", typeof r.json.gueltigBis === "string");
  const etag1 = r.etag;
  r = await anzeige(token, JAHR, { "if-none-match": etag1 });
  check("Token: gleicher ETag → 304", r.status === 304, String(r.status));

  // ── Fokus ──
  r = await api(planer, "PUT", `/plaene/${JAHR}/fokus`, { terminId: t1.id });
  check("Planer: Fokus setzen", r.status === 200, s(r));
  r = await anzeige(token, JAHR, { "if-none-match": etag1 });
  check("Fokus ändert den ETag (200 statt 304), Fokus in der Antwort", r.status === 200 && r.json.plan.fokusTerminId === t1.id && r.etag !== etag1, s(r));
  const [{ version: v0 }] = await owner`select version from dienstplan.plaene where id = ${plaene[JAHR]}`;
  check("Fokus ändert die Version nicht", r.json.plan.version === v0);
  const [{ id: fremd }] = await owner`insert into dienstplan.termine (plan_id, datum, kategorie_id) values (${plaene[ANDERES]}, ${`${ANDERES}-01-08`}, ${katD}) returning id`;
  r = await api(planer, "PUT", `/plaene/${JAHR}/fokus`, { terminId: fremd });
  check("Fokus auf Termin eines anderen Plans → 400", r.status === 400, s(r));
  r = await api(planer, "PUT", `/plaene/${JAHR}/fokus`, { terminId: "1" });
  check("Fokus mit ungültiger terminId → 400", r.status === 400, s(r));
  r = await api(mitglied, "PUT", `/plaene/${JAHR}/fokus`, { terminId: null });
  check("Mitglied: Fokus setzen → 403", r.status === 403, s(r));
  r = await api(null, "PUT", `/plaene/${JAHR}/fokus`, { terminId: null }, { "x-dienstplan-anzeige": token });
  check("Mit Token statt Anmeldung: Fokus setzen → 401", r.status === 401, s(r));

  // ── Änderung sichtbar ──
  const etag2 = (await anzeige(token)).etag;
  await owner`update dienstplan.termine set ort = 'Halle 2' where id = ${t2.id}`;
  r = await anzeige(token, JAHR, { "if-none-match": etag2 });
  check("Änderung am Termin: neuer ETag, Termin mit neuem Stand", r.status === 200 && r.json.termine.find((t) => t.id === t2.id).ort === "Halle 2", s(r));

  // ── Zugriffsfehler ──
  r = await api(null, "GET", `/anzeige/${JAHR}`);
  check("Ohne Token → 401", r.status === 401, s(r));
  r = await anzeige("A".repeat(43));
  check("Falsches Token (richtiges Format) → 401", r.status === 401, s(r));
  r = await anzeige("kurz");
  check("Falsches Token (falsches Format) → 401", r.status === 401, s(r));
  r = await anzeige(token.slice(0, -1) + (token.endsWith("A") ? "B" : "A"));
  check("Token mit einem geänderten Zeichen → 401", r.status === 401, s(r));
  r = await anzeige(token, ANDERES);
  check("Anderer Plan (Token für 2096, Abruf 2097) → 403", r.status === 403, s(r));
  r = await api(null, "GET", `/plaene/${JAHR}`, undefined, { "x-dienstplan-anzeige": token });
  check("Token öffnet nicht die normale Plan-Route → 401", r.status === 401, s(r));
  r = await api(null, "PATCH", `/termine/${t1.id}`, { ort: "x" }, { "x-dienstplan-anzeige": token });
  check("Token erlaubt kein Schreiben (PATCH Termin) → 401", r.status === 401, s(r));

  // Abgelaufen: Ablauf in die Vergangenheit setzen (Owner)
  await owner`update dienstplan.anzeige_tokens set gueltig_bis = now() - interval '1 second' where plan_id = ${plaene[JAHR]}`;
  r = await anzeige(token);
  check("Abgelaufener Link → 401", r.status === 401 && /abgelaufen/.test(r.json?.error ?? ""), s(r));
  r = await api(planer, "GET", `/plaene/${JAHR}/anzeige`);
  check("Abgelaufene Links stehen nicht in der Liste", r.status === 200 && r.json.links.length === 0, s(r));

  // Neuer Link räumt abgelaufene auf; Beenden sperrt sofort
  r = await api(planer, "POST", `/plaene/${JAHR}/anzeige`);
  const token2 = r.json.token;
  const [{ n: rest }] = await owner`select count(*)::int n from dienstplan.anzeige_tokens where plan_id = ${plaene[JAHR]}`;
  check("Neuer Link löscht abgelaufene", rest === 1, String(rest));
  check("Neuer Link funktioniert", (await anzeige(token2)).status === 200);
  r = await api(mitglied, "DELETE", `/plaene/${JAHR}/anzeige`);
  check("Mitglied: Links beenden → 403", r.status === 403, s(r));
  r = await api(planer, "DELETE", `/plaene/${JAHR}/anzeige`);
  check("Planer: alle Links beenden", r.status === 200 && r.json.beendet === 1, s(r));
  r = await anzeige(token2);
  check("Beendeter Link → 401", r.status === 401, s(r));

  // ── Seite ──
  const seite = await fetch(`${BASE}/dienstplan/${JAHR}/praesentation`, { redirect: "manual" });
  const html = await seite.text();
  check("Präsentationsseite lädt ohne Anmeldung (Daten erst per Token)", seite.status === 200 && !html.includes("geheime Notiz"), String(seite.status));
  check("Präsentationsseite ohne Portal-Kopfzeile", !html.includes("<header") || !html.includes("Abmelden"));
  check("Präsentationsseite: Referrer aus", /<meta name="referrer" content="no-referrer"/.test(html));
} catch (e) {
  fail++;
  console.log("FEHLER Ablauf:", e.message);
} finally {
  try {
    if (ids.plan.length) await owner`delete from dienstplan.plaene where id in ${owner(ids.plan)}`;
    if (ids.ben.length) await owner`delete from core.benutzer where id in ${owner(ids.ben)}`;
    if (ids.kam.length) await owner`delete from core.mitglieder_audit where kamerad_id in ${owner(ids.kam)}`;
    if (ids.kam.length) await owner`delete from core.kameraden where id in ${owner(ids.kam)}`;
    await owner`delete from core.login_attempts where benutzername like ${S + "%"}`;
    const [rest] = await owner`select
      (select count(*)::int from dienstplan.plaene where jahr in (${JAHR}, ${ANDERES})) p,
      (select count(*)::int from dienstplan.anzeige_tokens a join dienstplan.plaene p on p.id = a.plan_id where p.jahr in (${JAHR}, ${ANDERES})) t,
      (select count(*)::int from core.kameraden where name like ${S + "%"}) k`;
    console.log(`Aufräumen: Rest ${rest.p} Pläne, ${rest.t} Links, ${rest.k} Kameraden`);
    if (rest.p + rest.t + rest.k > 0) fail++;
  } catch (e) { console.log("AUFRÄUMEN FEHLGESCHLAGEN:", e.message); fail++; }
  await owner.end({ timeout: 5 });
}
console.log(`\n${ok} OK, ${fail} Fehler`);
process.exit(fail ? 1 : 0);
