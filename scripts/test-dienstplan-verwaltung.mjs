// Phase 5 Ende zu Ende: neues Jahr mit Vorschau und "Zwischendienst um 2 Wochen
// versetzen" (Spec 5.2a), Verwaltung (Kategorien, Rhythmusregeln, Bereiche) je
// Rolle, Seiten /dienstplan/planung, /dienstplan/[jahr]/bearbeiten,
// /dienstplan/verwaltung je Rolle.
// Der Versatz ändert die Rhythmusregeln: Der Test merkt sich ihren Stand vorher
// und stellt ihn im finally als Owner wieder her (neue Regeln weg, alte Werte
// zurück). Plan im Jahr 2094, Testdaten mit Zeitstempel-Präfix.
//
// Aufruf:  node scripts/test-dienstplan-verwaltung.mjs
// Voraussetzung: Dev-Server (npx next dev --webpack -p 3100) mit derselben Datenbank.
// Env (aus .env.local): MIGRATE_DATABASE_URL (Owner), TEST_BASE optional
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { schutz } from "./lib/schutz.mjs";
import { regelnMitVersatz, rhythmusTreffer } from "../src/lib/dienstplan/kalender.ts";

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
const S = `dpv${Date.now().toString(36)}`;
const JAHR = 2094;
const ids = { kam: [], ben: [], kat: [] };
let ip = 40;

async function konto(rolle) {
  const [k] = await owner`insert into core.kameraden (name, vorname, dienst_rolle) values (${S + rolle}, 'Test', ${rolle === "Mitglied" ? null : rolle}) returning id`;
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
async function seite(wer, pfad) {
  const r = await fetch(`${BASE}${pfad}`, { redirect: "manual", headers: wer ? { cookie: wer.cookie } : {} });
  return { status: r.status, ort: r.headers.get("location") ?? "", html: r.status === 200 ? await r.text() : "" };
}
const s = (r) => `${r.status} ${JSON.stringify(r.json)?.slice(0, 200)}`;
const REGEL_SPALTEN = owner`id, name, typ::text as typ, wochentag, to_char(uhrzeit, 'HH24:MI') as uhrzeit, anker_datum::text as "ankerDatum", muster,
  nter_wochentag as "nterWochentag", monate, kategorie_kuerzel as "kategorieKuerzel", gueltig_ab::text as "gueltigAb", gueltig_bis::text as "gueltigBis", aktiv`;
const ladeRegeln = async () => (await owner`select ${REGEL_SPALTEN} from dienstplan.rhythmus_regeln where organisation_id = 1 order by id`).map((r) => ({ ...r }));

const regelnVorher = await ladeRegeln();
try {
  await owner`delete from dienstplan.plaene where jahr = ${JAHR}`;
  const admin = await konto("Admin"), planer = await konto("Planer"), mitglied = await konto("Mitglied");

  // ── Vorschau ──
  let r = await api(mitglied, "GET", `/plaene/vorschau?jahr=${JAHR}&versatz=2`);
  check("Vorschau als Mitglied → 403", r.status === 403, s(r));
  r = await api(planer, "GET", `/plaene/vorschau?jahr=${JAHR}&versatz=5`);
  check("Vorschau mit Versatz 5 → 400", r.status === 400, s(r));
  const v0 = await api(planer, "GET", `/plaene/vorschau?jahr=${JAHR}&versatz=0&wochen=8`);
  const v2 = await api(planer, "GET", `/plaene/vorschau?jahr=${JAHR}&versatz=2&wochen=8`);
  const erwartet = (v) => rhythmusTreffer(regelnMitVersatz(regelnVorher.filter((x) => x.aktiv), JAHR, "Z", v).regeln, JAHR)
    .filter((t) => t.datum < `${JAHR}-02-26`).map((t) => `${t.datum} ${t.kuerzel}`);
  const ist = (v) => v.json?.termine?.map((t) => `${t.datum} ${t.kuerzel}`);
  check("Vorschau ohne Versatz = Generator (8 Wochen)", JSON.stringify(ist(v0)) === JSON.stringify(erwartet(0)), JSON.stringify(ist(v0)));
  check("Vorschau mit Versatz = Generator mit versetzter Regel", JSON.stringify(ist(v2)) === JSON.stringify(erwartet(2)) && v2.json.moeglich, JSON.stringify(ist(v2)));
  const z = (v) => (v.json?.termine ?? []).filter((t) => t.kuerzel === "Z").map((t) => t.datum);
  const d = (v) => (v.json?.termine ?? []).filter((t) => t.kuerzel === "D").map((t) => t.datum);
  check("Versatz verschiebt Z um 14 Tage, D bleibt", z(v0).length > 0 && JSON.stringify(d(v0)) === JSON.stringify(d(v2)) && z(v2).every((x) => !z(v0).includes(x)), `${z(v0)} | ${z(v2)}`);
  const v27 = await api(planer, "GET", "/plaene/vorschau?jahr=2027&versatz=0&wochen=8");
  check("Vorschau 2027 zeigt das Ende des Plans 2026 (falls importiert)", v27.status === 200 && Array.isArray(v27.json.vorjahr), s(v27));

  // ── Plan mit Versatz anlegen ──
  r = await api(planer, "POST", "/plaene", { jahr: JAHR, zwischendienstVersatz: 2 });
  check("Plan mit Versatz als Planer → 403", r.status === 403, s(r));
  r = await api(admin, "POST", "/plaene", { jahr: JAHR, zwischendienstVersatz: 2 });
  check("Plan mit Versatz als Admin → 201, Regel aufgeteilt", r.status === 201 && r.json.versatz?.neu?.length === 1, s(r));
  const regelnNachher = await ladeRegeln();
  const alt = regelnNachher.find((x) => x.id === r.json?.versatz?.geaendert?.[0]);
  const neu = regelnNachher.find((x) => x.id === r.json?.versatz?.neu?.[0]);
  check("Alte Regel endet am 31.12. des Vorjahres", alt?.gueltigBis === `${JAHR - 1}-12-31`, JSON.stringify(alt));
  check("Neue Regel ab 01.01., Muster versetzt, Anker gleich", neu?.gueltigAb === `${JAHR}-01-01` && neu.ankerDatum === alt.ankerDatum && neu.muster.join() !== alt.muster.join(), JSON.stringify(neu));
  const plan = await api(planer, "GET", `/plaene/${JAHR}`);
  const zPlan = plan.json.termine.filter((t) => t.kuerzel === "Z" && t.datum < `${JAHR}-02-26`).map((t) => t.datum);
  check("Generierte Z-Termine = Vorschau mit Versatz", JSON.stringify(zPlan) === JSON.stringify(z(v2)), `${zPlan} | ${z(v2)}`);
  check("Generierte Z verweisen auf die neue Regel", plan.json.termine.filter((t) => t.kuerzel === "Z").every((t) => t.regelId === neu?.id));
  const vorjahrTreffer = rhythmusTreffer(regelnNachher.filter((x) => x.aktiv), JAHR - 1).filter((t) => t.kuerzel === "Z").map((t) => t.datum);
  const vorjahrVorher = rhythmusTreffer(regelnVorher.filter((x) => x.aktiv), JAHR - 1).filter((t) => t.kuerzel === "Z").map((t) => t.datum);
  check("Vorjahr bleibt unverändert (Generator)", JSON.stringify(vorjahrTreffer) === JSON.stringify(vorjahrVorher));

  // ── Kategorien ──
  r = await api(planer, "POST", "/kategorien", { kuerzel: "QX", name: `${S} Kat`, farbe: "green" });
  check("Kategorie anlegen als Planer → 403", r.status === 403, s(r));
  r = await api(admin, "POST", "/kategorien", { kuerzel: "QX", name: `${S} Kat`, farbe: "green", standardUhrzeit: "18:00" });
  const katId = r.json?.id;
  if (katId) ids.kat.push(katId);
  check("Kategorie anlegen als Admin", r.status === 201 && katId, s(r));
  r = await api(admin, "POST", "/kategorien", { kuerzel: "qx", name: "doppelt", farbe: "blue" });
  check("Kürzel doppelt → 409", r.status === 409, s(r));
  r = await api(admin, "PATCH", `/kategorien/${katId}`, { farbe: "#00ff00" });
  check("Farbe ohne Token → 400", r.status === 400, s(r));
  r = await api(admin, "PATCH", `/kategorien/${katId}`, { aktiv: false, sortierung: 99 });
  check("Kategorie deaktivieren", r.status === 200, s(r));
  r = await api(mitglied, "GET", "/kategorien");
  check("Mitglied liest Kategorien inkl. neuer", r.json?.kategorien?.some((k) => k.id === katId && !k.aktiv), s(r));

  // ── Regeln ──
  r = await api(mitglied, "GET", "/regeln");
  check("Regeln lesen als Mitglied → 403", r.status === 403, s(r));
  r = await api(planer, "GET", "/regeln");
  check("Regeln lesen als Planer", r.status === 200 && r.json.regeln.length >= 3, s(r));
  const regelBody = { name: `${S} Regel`, typ: "monats_wochentag", wochentag: 6, uhrzeit: "13:00", nterWochentag: -1, monate: [11], kategorieKuerzel: "QX", gueltigAb: "2090-01-01", aktiv: false };
  r = await api(planer, "POST", "/regeln", regelBody);
  check("Regel anlegen als Planer → 403", r.status === 403, s(r));
  r = await api(admin, "POST", "/regeln", { ...regelBody, kategorieKuerzel: null });
  check("Monats-Regel ohne Kürzel → 400", r.status === 400, s(r));
  r = await api(admin, "POST", "/regeln", regelBody);
  const regelId = r.json?.id;
  check("Regel anlegen (letzter Samstag im November, inaktiv)", r.status === 201 && regelId, s(r));
  r = await api(planer, "GET", `/regeln/${regelId}/vorschau?anzahl=3&ab=2094-01-01`);
  check("Regel-Vorschau: letzte Samstage im November", r.status === 200 && r.json.treffer.map((t) => t.datum).join() === "2094-11-27,2095-11-26,2096-11-24", s(r));
  r = await api(admin, "PATCH", `/regeln/${regelId}`, { typ: "wochen_zyklus" });
  check("Typwechsel ohne Anker/Muster → 400", r.status === 400, s(r));
  r = await api(admin, "PATCH", `/regeln/${regelId}`, { gueltigBis: "2089-12-31" });
  check("gültig bis vor gültig ab → 400", r.status === 400, s(r));
  r = await api(admin, "PATCH", `/regeln/${regelId}`, { monate: [10, 11], name: `${S} Regel 2` });
  const [geaendert] = await owner`select name, monate from dienstplan.rhythmus_regeln where id = ${regelId}`;
  check("Regel ändern (zusammengeführt)", r.status === 200 && geaendert.name === `${S} Regel 2` && geaendert.monate.join() === "10,11", s(r));

  // ── Bereiche ──
  r = await api(planer, "POST", "/bereiche", { name: `${S} Atemschutz` });
  const bereichId = r.json?.id;
  check("Bereich anlegen (Planer)", r.status === 201 && bereichId, s(r));
  r = await api(planer, "POST", "/bereiche", { name: `${S} Atemschutz` });
  check("Bereich doppelt → 409", r.status === 409, s(r));
  r = await api(mitglied, "POST", "/bereiche", { name: `${S} X` });
  check("Bereich anlegen als Mitglied → 403", r.status === 403, s(r));
  r = await api(planer, "PATCH", `/bereiche/${bereichId}`, { sortierung: 5 });
  check("Bereich ändern", r.status === 200, s(r));
  r = await api(planer, "POST", "/themen", { titel: `${S} Thema`, bereichId });
  check("Thema mit Bereich", r.status === 201, s(r));

  // ── Seiten ──
  let p = await seite(null, "/dienstplan/planung");
  check("Planung ohne Login → /login", [302, 303, 307, 308].includes(p.status) && p.ort.includes("/login"), `${p.status} ${p.ort}`);
  p = await seite(mitglied, "/dienstplan/planung");
  check("Planung als Mitglied → Startseite mit Hinweis kein_zugriff=dienstplan", [302, 303, 307, 308].includes(p.status) && p.ort.includes("kein_zugriff=dienstplan"), `${p.status} ${p.ort}`);
  p = await seite(planer, "/dienstplan/planung");
  check("Planung als Planer: Seite mit Plan, ohne „Neues Jahr“", p.status === 200 && p.html.includes("Dienstplan – Planung") && p.html.includes(String(JAHR)) && !p.html.includes("Neues Jahr anlegen"), String(p.status));
  p = await seite(admin, "/dienstplan/planung");
  check("Planung als Admin: „Neues Jahr anlegen“", p.status === 200 && p.html.includes("Neues Jahr anlegen"));
  p = await seite(planer, `/dienstplan/${JAHR}/bearbeiten`);
  check("Eingabemaske als Planer → 200", p.status === 200, String(p.status));
  p = await seite(mitglied, `/dienstplan/${JAHR}/bearbeiten`);
  check("Eingabemaske als Mitglied → umgeleitet", [302, 303, 307, 308].includes(p.status), String(p.status));
  p = await seite(planer, "/dienstplan/abc/bearbeiten");
  check("Eingabemaske mit ungültigem Jahr → 404", p.status === 404, String(p.status));
  p = await seite(planer, "/dienstplan/verwaltung");
  check("Verwaltung als Planer → 200", p.status === 200 && p.html.includes("Dienstplan – Verwaltung"), String(p.status));
  p = await seite(mitglied, "/dienstplan/verwaltung");
  check("Verwaltung als Mitglied → Startseite mit Hinweis kein_zugriff=dienstplan", [302, 303, 307, 308].includes(p.status) && p.ort.includes("kein_zugriff=dienstplan"), `${p.status} ${p.ort}`);
} finally {
  try {
    await owner`delete from dienstplan.plaene where jahr = ${JAHR}`;
    // Regeln auf den Stand vorher: neue löschen, alte Werte zurück
    const vorherIds = regelnVorher.map((x) => x.id);
    await owner`delete from dienstplan.rhythmus_regeln where organisation_id = 1 and id not in ${owner(vorherIds)}`;
    for (const x of regelnVorher) {
      await owner`update dienstplan.rhythmus_regeln set gueltig_bis = ${x.gueltigBis}, gueltig_ab = ${x.gueltigAb}, muster = ${x.muster}, aktiv = ${x.aktiv} where id = ${x.id}`;
    }
    const nachher = await ladeRegeln();
    if (JSON.stringify(nachher) !== JSON.stringify(regelnVorher)) { console.log("AUFRÄUMEN: Regeln nicht wiederhergestellt"); fail++; }
    await owner`delete from dienstplan.themen where titel like ${S + "%"}`;
    await owner`delete from dienstplan.bereiche where name like ${S + "%"}`;
    if (ids.kat.length) await owner`delete from dienstplan.kategorien where id in ${owner(ids.kat)}`;
    if (ids.ben.length) await owner`delete from core.benutzer where id in ${owner(ids.ben)}`;
    if (ids.kam.length) await owner`delete from core.mitglieder_audit where kamerad_id in ${owner(ids.kam)}`;
    if (ids.kam.length) await owner`delete from core.kameraden where id in ${owner(ids.kam)}`;
    await owner`delete from core.login_attempts where benutzername like ${S.toLowerCase() + "%"}`;
  } catch (e) { console.log("AUFRÄUMEN FEHLGESCHLAGEN:", e.message); fail++; }
  await owner.end({ timeout: 5 });
}
console.log(`\n${ok} OK, ${fail} Fehler`);
process.exit(fail ? 1 : 0);
