// Sitzungen, PIN, Zugangsverwaltung und Portal-Rahmen per HTTP.
// Ersetzt die früheren Einmal-Tests Stufe 3a, 3b, 4 und den Logout-Teil von Stufe 2.
//
// Aufruf:  node scripts/test-sitzungen.mjs
// Env (aus .env.local, falls vorhanden):
//   DATABASE_URL          fw_app: nur für die Prüfung von core.login_attempts
//   MIGRATE_DATABASE_URL  Owner: Testkonten anlegen, kontrollieren, aufräumen
//   TEST_BASE             optional, Standard http://localhost:3100
// Voraussetzung: lokaler Dev-Server (npx next dev --webpack -p 3100) auf derselben Datenbank.
// Geprüft wird: JWT-Claims, /api/admin/benutzer und /api/admin/rollen (Validierung,
// Konflikte, Rechte), Widerruf alter Tokens (Rollenänderung, eigene und fremde PIN-Änderung,
// "überall abmelden", Deaktivierung), PIN-Sperre, Selbstschutz der Admins, Logout,
// Zugriff auf core.login_attempts, Startseite/Kacheln/Kopfzeile je Rolle.
// Alle Konten entstehen mit Zeitstempel-Präfix; aufgeräumt wird über gemerkte IDs.
// Das Konto aus FWHUB_ADMIN_USER wird nie benutzt, nur vorher/nachher verglichen.
// Bricht ab, wenn Datenbank oder Server nicht lokal sind. Secrets werden nie ausgegeben.
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { schutz } from "./lib/schutz.mjs";

const P = resolve(fileURLToPath(new URL("..", import.meta.url)));
if (existsSync(`${P}/.env.local`)) process.loadEnvFile(`${P}/.env.local`);
const req = createRequire(`${P}/package.json`);
const imp = async (m) => import(pathToFileURL(req.resolve(m)).href);
const postgres = (await imp("postgres")).default;
const bcrypt = (await imp("bcryptjs")).default;
const BASE = process.env.TEST_BASE || "http://localhost:3100";

schutz({ db: ["DATABASE_URL", "MIGRATE_DATABASE_URL"], base: BASE });
const app = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const owner = postgres(process.env.MIGRATE_DATABASE_URL, { max: 1, onnotice: () => {} });

const stamp = `ss${Date.now().toString(36)}`;
let fail = 0;
const check = (n, c, i = "") => { if (!c) fail++; console.log(`${c ? "OK  " : "FEHLER"} ${n}${i ? " — " + i : ""}`); };
const ids = { kam: [], ben: [] }, namen = [];
const hash = await bcrypt.hash("000000", 12);
let ipZaehler = 0;
const neueIp = () => `198.51.100.${(++ipZaehler % 250) + 1}`;
const HASH = /\$2[aby]\$\d\d\$/;

const adminName = String(process.env.FWHUB_ADMIN_USER || "").toLowerCase();
const adminSnap = async () => JSON.stringify((await owner`
  select b.aktiv, b.rolle, b.token_version, md5(b.pin) p, k.aktiv ka, k.psa_rolle, k.food_rolle, k.fk_rolle, k.funk_rolle
  from core.benutzer b join core.kameraden k on k.id = b.kamerad_id where lower(b.benutzername) = ${adminName}`)[0] ?? null);
const vorher = await adminSnap();

// Konto über den Owner (Kamerad, optional mit Login)
async function konto(suffix, { appRolle = "User", psa = null, food = null, funk = null, fk = null, login = true, pin = "000000" } = {}) {
  const name = `${stamp}-${suffix}`; namen.push(name);
  const [k] = await owner`insert into core.kameraden (name, vorname, aktiv, psa_rolle, food_rolle, funk_rolle, fk_rolle) values (${name}, 'Ss', true, ${psa}, ${food}, ${funk}, ${fk}) returning id`;
  ids.kam.push(k.id);
  let benutzer = null;
  if (login) {
    const h = pin === "000000" ? hash : await bcrypt.hash(pin, 12);
    const [b] = await owner`insert into core.benutzer (benutzername, pin, rolle, kamerad_id) values (${name}, ${h}, ${appRolle}, ${k.id}) returning id`;
    ids.ben.push(b.id); benutzer = b.id;
  }
  return { name, kamerad: k.id, benutzer, pin, ip: neueIp() };
}
async function anmelden(k, pin = k.pin, ip = k.ip) {
  const r = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json", "x-real-ip": ip }, body: JSON.stringify({ benutzername: k.name, pin }) });
  const cookie = (r.headers.get("set-cookie") || "").split(";")[0];
  return { status: r.status, cookie };
}
const sitzung = async (k, pin) => { const r = await anmelden(k, pin); if (r.status !== 200) throw new Error(`Anmeldung ${k.name} → ${r.status}`); return r.cookie; };
async function call(m, pfad, cookie, body, ip = "198.51.100.250") {
  const r = await fetch(`${BASE}${pfad}`, { method: m, redirect: "manual", headers: { "x-real-ip": ip, ...(cookie ? { cookie } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* HTML */ }
  return { status: r.status, json, text, loc: r.headers.get("location") || "", setCookie: r.headers.get("set-cookie") || "" };
}
const claims = (cookie) => JSON.parse(Buffer.from(cookie.replace("fw_jwt=", "").split(".")[1], "base64url").toString());
const probe = (cookie) => call("GET", "/api/psa/kameraden", cookie).then((r) => r.status);   // 200 mit psa_rolle, sonst 401
const zeile = async (id) => (await owner`select aktiv, token_version tv, rolle from core.benutzer where id = ${id}`)[0];

try {
  const [who] = await app`select current_user u, (select rolsuper or rolbypassrls from pg_roles where rolname = current_user) bypass`;
  check("DB-Verbindung der Tests ist fw_app ohne Superuser/BYPASSRLS", who.u === "fw_app" && who.bypass === false, who.u);

  const adm = await konto("adm", { appRolle: "Admin" });          // globaler Admin ohne psa_rolle
  const adm2 = await konto("adm2", { appRolle: "Admin" });         // zweiter globaler Admin
  let a = await sitzung(adm);

  // ── JWT und Admin-API ──
  const c = claims(a);
  check("JWT enthält benutzer_id, tv, kamerad_id und exp", c.benutzer_id === adm.benutzer && Number.isInteger(c.tv) && c.kamerad_id === adm.kamerad && c.exp > Date.now() / 1000, Object.keys(c).join(","));
  let s = await call("GET", "/api/admin/benutzer", a);
  check("API: globaler Admin ohne psa_rolle liest die Benutzerliste (200)", s.status === 200 && Array.isArray(s.json?.benutzer), `${s.status}`);
  const meinEintrag = (s.json?.benutzer || []).find((b) => b.benutzername === adm.name);
  check("Liste ohne pin-Feld, mit Modulrollen und Kameradnamen", meinEintrag && !("pin" in meinEintrag) && ["psaRolle", "foodRolle", "fkRolle", "funkRolle"].every((f) => f in meinEintrag) && JSON.stringify(meinEintrag).includes(adm.name), JSON.stringify(Object.keys(meinEintrag || {})));
  check("Kein bcrypt-Hash in der Listenantwort", !HASH.test(s.text));

  const kU = await konto("u", { login: false }), kD = await konto("d", { login: false }), kX = await konto("x", { login: false });
  const kP = await konto("p", { login: false }), kP2 = await konto("p2", { login: false }), kS = await konto("s", { login: false }), kR = await konto("r", { login: false });
  const neuesKonto = async (k) => {
    k.name = `${stamp}-ben-${k.name.split("-").pop()}`; namen.push(k.name);
    const r = await call("POST", "/api/admin/benutzer", a, { kameradId: k.kamerad, benutzername: k.name, pin: "444444" });
    if (r.status !== 201) throw new Error(`Benutzer ${k.name} → ${r.status}`);
    k.benutzer = r.json.benutzer.id; ids.ben.push(k.benutzer); k.pin = "444444";
    return r;
  };
  let r = await neuesKonto(kU);
  check("POST /api/admin/benutzer → 201, Antwort ohne PIN", r.status === 201 && r.json.benutzer.benutzername === kU.name && !("pin" in r.json.benutzer) && !HASH.test(r.text));
  s = await call("POST", "/api/admin/benutzer", a, { kameradId: kD.kamerad, benutzername: kU.name.toUpperCase(), pin: "444444" });
  check("Doppelter Benutzername (Groß-/Kleinschreibung) → 409", s.status === 409, `${s.status}`);
  s = await call("POST", "/api/admin/benutzer", a, { kameradId: kU.kamerad, benutzername: `${stamp}-zweit`, pin: "444444" });
  check("Zweiter Account für denselben Kameraden → 409", s.status === 409, `${s.status}`);
  s = await call("POST", "/api/admin/benutzer", a, { kameradId: kD.kamerad, benutzername: `${stamp}-kurz`, pin: "12345" });
  check("PIN mit weniger als 6 Zeichen → 400", s.status === 400, `${s.status}`);
  s = await call("POST", "/api/admin/benutzer", a, { kameradId: 99999999, benutzername: `${stamp}-nok`, pin: "444444" });
  check("Unbekannter Kamerad → 404", s.status === 404, `${s.status}`);
  s = await call("POST", "/api/admin/benutzer", a, { benutzername: `${stamp}-nokid`, pin: "444444" });
  check("kamerad_id fehlt → 400", s.status === 400, `${s.status}`);
  check("Nach den abgelehnten Anfragen gibt es keinen dieser Benutzer", (await owner`select count(*)::int n from core.benutzer where benutzername in (${`${stamp}-zweit`}, ${`${stamp}-kurz`}, ${`${stamp}-nok`}, ${`${stamp}-nokid`})`)[0].n === 0);

  // ── Rollen-API und Widerruf alter Tokens ──
  s = await call("PATCH", `/api/admin/rollen/${kU.kamerad}`, a, { psaRolle: "User" });
  check("Rollen setzen (psaRolle User) → 200", s.status === 200, `${s.status}`);
  s = await call("PATCH", `/api/admin/rollen/${kU.kamerad}`, a, { psaRolle: "Chef" });
  check("Ungültige psaRolle → 400", s.status === 400, `${s.status}`);
  s = await call("PATCH", `/api/admin/rollen/${kU.kamerad}`, a, { fkRolle: "Kleiderwart" });
  check("Ungültige fkRolle → 400", s.status === 400, `${s.status}`);
  const uAlt = await sitzung(kU);
  const cu = claims(uAlt);
  check("Claims des Users: psa_rolle User, funk_rolle leer", cu.psa_rolle === "User" && !cu.funk_rolle, `${cu.psa_rolle}/${cu.funk_rolle}`);
  check("Probe-Request mit dem Token → 200", (await probe(uAlt)) === 200);
  s = await call("PATCH", `/api/admin/rollen/${kU.kamerad}`, a, { funkRolle: "Mitglied" });
  check("Rollenänderung → 200", s.status === 200, `${s.status}`);
  check("Kopiertes Token nach Rollenänderung → 401", (await probe(uAlt)) === 401);
  const uNeu = await sitzung(kU);
  check("Nach neuem Login: funk_rolle Mitglied, psa_rolle User", claims(uNeu).funk_rolle === "Mitglied" && claims(uNeu).psa_rolle === "User");
  // Admin: eigenes Token nach Änderung der eigenen Rolle
  const aAlt = a; s = await call("PATCH", `/api/admin/rollen/${adm.kamerad}`, a, { psaRolle: "Admin" });
  check("Rollen-API: psaRolle am eigenen Kameraden → 200", s.status === 200, `${s.status}`);
  check("Altes Admin-Token nach Rollenänderung → 401", (await call("GET", "/api/admin/benutzer", aAlt)).status === 401);
  const a2 = await sitzung(adm);
  check("Nach neuem Login: psa_rolle Admin und token_version erhöht", claims(a2).psa_rolle === "Admin" && claims(a2).tv > c.tv, `${claims(a2).tv} > ${c.tv}`);
  await call("PATCH", `/api/admin/rollen/${adm.kamerad}`, a2, { psaRolle: null });   // zurück: globaler Admin ohne psa_rolle
  const aNeu = await sitzung(adm); a = aNeu;

  // ── Rechte auf /api/admin/* ──
  const st403 = [
    (await call("GET", "/api/admin/benutzer", uNeu)).status,
    (await call("POST", "/api/admin/benutzer", uNeu, {})).status,
    (await call("PATCH", `/api/admin/benutzer/${adm.benutzer}`, uNeu, { aktiv: false })).status,
    (await call("PATCH", `/api/admin/rollen/${kU.kamerad}`, uNeu, { psaRolle: "Admin" })).status,
  ];
  const st401 = [
    (await call("GET", "/api/admin/benutzer")).status,
    (await call("POST", "/api/admin/benutzer", null, {})).status,
    (await call("PATCH", `/api/admin/benutzer/${adm.benutzer}`, null, { aktiv: false })).status,
    (await call("PATCH", `/api/admin/rollen/${kU.kamerad}`, null, { psaRolle: "Admin" })).status,
  ];
  check("Nicht-Admin auf /api/admin/* → 403", st403.every((x) => x === 403), st403.join(","));
  check("Ohne Cookie auf /api/admin/* → 401", st401.every((x) => x === 401), st401.join(","));

  // ── Eigene PIN ──
  await neuesKonto(kP); await call("PATCH", `/api/admin/rollen/${kP.kamerad}`, aNeu, { psaRolle: "User" });
  const pAlt = await sitzung(kP);
  s = await call("POST", "/api/auth/pin", pAlt, { altePin: "000000", neuePin: "555555" });
  check("PIN-Änderung mit falscher alter PIN → 403", s.status === 403, `${s.status}`);
  s = await call("POST", "/api/auth/pin", pAlt, { altePin: kP.pin, neuePin: "123" });
  check("Neue PIN zu kurz → 400", s.status === 400, `${s.status}`);
  s = await call("POST", "/api/auth/pin", pAlt, { altePin: kP.pin, neuePin: "555555" });
  const pNeu = (s.setCookie || "").split(";")[0];
  check("PIN-Änderung → 200 mit neuem Cookie", s.status === 200 && pNeu.startsWith("fw_jwt="), `${s.status}`);
  check("Kopiertes Token nach PIN-Änderung → 401", (await probe(pAlt)) === 401);
  check("Neues Cookie aus der PIN-Änderung ist gültig", (await probe(pNeu)) === 200);
  check("Login mit alter PIN → 401, mit neuer → 200", (await anmelden(kP, kP.pin)).status === 401 && (await anmelden(kP, "555555")).status === 200);
  check("Hash der neuen PIN nicht in der Antwort", !HASH.test(s.text) && !s.text.includes("555555"));

  // PIN-Sperre: 5 falsche alte PINs, danach 429 (auch mit richtiger), Login ebenfalls gesperrt
  await neuesKonto(kP2); await call("PATCH", `/api/admin/rollen/${kP2.kamerad}`, aNeu, { psaRolle: "User" });
  const p2 = await sitzung(kP2);
  const sperrIp = kP2.ip, codes = [];
  for (let i = 0; i < 5; i++) codes.push((await call("POST", "/api/auth/pin", p2, { altePin: "000000", neuePin: "666666" }, sperrIp)).status);
  const gesperrt = await call("POST", "/api/auth/pin", p2, { altePin: kP2.pin, neuePin: "666666" }, sperrIp);
  check("PIN-Route: 5 falsche alte PINs → 403, danach 429 (auch mit richtiger PIN)", codes.every((x) => x === 403) && gesperrt.status === 429, `${codes.join(",")} → ${gesperrt.status}`);
  check("Der Login ist dann ebenfalls gesperrt (gleiche Sperre)", (await anmelden(kP2, kP2.pin, sperrIp)).status === 429);
  await owner`delete from core.login_attempts where benutzername = ${kP2.name.toLowerCase()}`;
  check("Rettungsweg (login_attempts löschen) entsperrt", (await anmelden(kP2, kP2.pin, sperrIp)).status === 200);

  // ── Überall abmelden ──
  await neuesKonto(kS); await call("PATCH", `/api/admin/rollen/${kS.kamerad}`, aNeu, { psaRolle: "User" });
  const s1 = await sitzung(kS), s2 = await sitzung(kS);
  s = await call("POST", "/api/auth/abmelden-ueberall", s1);
  check("Überall abmelden → 200, Cookie gelöscht", s.status === 200 && /fw_jwt=;/.test(s.setCookie) && /Max-Age=0/i.test(s.setCookie), `${s.status}`);
  check("Andere Sitzung danach → 401, eigene alte ebenfalls", (await probe(s2)) === 401 && (await probe(s1)) === 401);
  check("Ohne Session: abmelden-ueberall und pin → 401", (await call("POST", "/api/auth/abmelden-ueberall")).status === 401 && (await call("POST", "/api/auth/pin", null, { altePin: "1", neuePin: "2" })).status === 401);

  // ── PIN-Reset, Deaktivieren, Reaktivieren durch den Admin ──
  await neuesKonto(kR); await call("PATCH", `/api/admin/rollen/${kR.kamerad}`, aNeu, { psaRolle: "User" });
  const rAlt = await sitzung(kR);
  s = await call("PATCH", `/api/admin/benutzer/${kR.benutzer}`, aNeu, { pin: "777777" });
  check("Admin-PIN-Reset → 200, ohne PIN in der Antwort", s.status === 200 && !s.text.includes("777777") && !HASH.test(s.text), `${s.status}`);
  check("Kopiertes Token nach Admin-PIN-Reset → 401", (await probe(rAlt)) === 401);
  check("Login mit zurückgesetzter PIN → 200", (await anmelden(kR, "777777")).status === 200);

  await neuesKonto(kX); await call("PATCH", `/api/admin/rollen/${kX.kamerad}`, aNeu, { psaRolle: "User" });
  const xAlt = await sitzung(kX), tv0 = (await zeile(kX.benutzer)).tv;
  s = await call("PATCH", `/api/admin/benutzer/${kX.benutzer}`, aNeu, { aktiv: false });
  const z = await zeile(kX.benutzer);
  check("Admin deaktiviert Benutzer → 200, aktiv false, token_version + 1", s.status === 200 && z.aktiv === false && z.tv === tv0 + 1, `${s.status} ${tv0}->${z.tv}`);
  check("Kopiertes Token eines deaktivierten Benutzers → 401", (await probe(xAlt)) === 401);
  check("Login des deaktivierten Benutzers schlägt fehl", (await anmelden(kX, kX.pin)).status !== 200);
  s = await call("PATCH", `/api/admin/benutzer/${kX.benutzer}`, aNeu, { aktiv: true });
  check("Reaktivierung → 200, Login wieder möglich", s.status === 200 && (await anmelden(kX, kX.pin)).status === 200, `${s.status}`);
  await owner`update core.kameraden set aktiv = false where id = ${kX.kamerad}`;   // Trigger deaktiviert auch den Benutzer
  s = await call("PATCH", `/api/admin/benutzer/${kX.benutzer}`, aNeu, { aktiv: true });
  check("Reaktivierung bei deaktiviertem Kameraden → 409", s.status === 409 && (await zeile(kX.benutzer)).aktiv === false, `${s.status}`);

  // ── Selbstschutz und zweiter Admin ──
  s = await call("PATCH", `/api/admin/benutzer/${adm.benutzer}`, aNeu, { aktiv: false });
  const s2r = await call("PATCH", `/api/admin/benutzer/${adm.benutzer}`, aNeu, { rolle: "User" });
  const s3 = await call("PATCH", `/api/mitglieder/${adm.kamerad}`, aNeu, { aktiv: false });
  check("Selbst-Deaktivierung, eigene Rolle absenken und eigenen Kameraden deaktivieren → 409", s.status === 409 && s2r.status === 409 && s3.status === 409, `${s.status}/${s2r.status}/${s3.status}`);
  const zAdm = await zeile(adm.benutzer);
  check("Test-Admin danach unverändert aktiv und Admin", zAdm.aktiv === true && zAdm.rolle === "Admin");
  const b2 = await sitzung(adm2);
  s = await call("PATCH", `/api/mitglieder/${adm2.kamerad}`, aNeu, { aktiv: false });
  check("Ein weiterer Admin darf einen anderen Admin deaktivieren (200), dessen Token → 401", s.status === 200 && (await call("GET", "/api/admin/benutzer", b2)).status === 401, `${s.status}`);

  // ── Logout ──
  const lo = await sitzung(await konto("lo", { psa: "User" }).then((k) => { k.pin = "000000"; return k; }));
  const loK = (await owner`select benutzername from core.benutzer where kamerad_id = ${ids.kam.at(-1)}`)[0];
  s = await call("POST", "/api/auth/logout", lo);
  check("POST /api/auth/logout → 200, Cookie gelöscht (Max-Age=0, HttpOnly)", s.status === 200 && /fw_jwt=;/.test(s.setCookie) && /Max-Age=0/i.test(s.setCookie) && /HttpOnly/i.test(s.setCookie), `${s.status}`);
  check("GET /api/auth/logout → 405", (await call("GET", "/api/auth/logout", lo)).status === 405);
  s = await call("GET", "/psa");
  check("Ohne Cookie (nach Logout) /psa → /login", s.status === 307 && s.loc.endsWith("/login"), `${s.status} ${s.loc}`);
  check("Bekannte Grenze: ein kopiertes JWT bleibt bis exp gültig (Logout ändert token_version nicht)", (await probe(lo)) === 200 && !!loK);

  // ── core.login_attempts für fw_app ──
  let code = null;
  try { await app`select 1 from core.login_attempts limit 1`; } catch (e) { code = e.code; }
  check("fw_app: SELECT auf core.login_attempts → 42501", code === "42501", String(code));
  code = null;
  try { await app`insert into core.login_attempts (benutzername, ip, erfolgreich) values ('x', '127.0.0.1', false)`; } catch (e) { code = e.code; }
  check("fw_app: INSERT auf core.login_attempts → 42501", code === "42501", String(code));

  // ── Portal-Rahmen: Kacheln, Kopfzeile, Hinweise ──
  const kacheln = (h) => [...h.matchAll(/data-kachel="([a-z]+)"/g)].map((m) => m[1]).sort();
  const abmelden = (h) => (h.match(/>Abmelden</g) || []).length;
  const profile = [
    { s: "psa", opt: { psa: "User" }, erwartet: ["psa"] },
    { s: "ff", opt: { funk: "Mitglied", food: "Admin" }, erwartet: ["food", "funk", "mitglieder"] },
    { s: "nix", opt: {}, erwartet: [] },
    { s: "fm", opt: { food: "Mitglied", fk: "Prüfer" }, erwartet: [] },
  ];
  for (const p of profile) { const k = await konto(`pf-${p.s}`, p.opt); p.cookie = await sitzung(k); }
  for (const p of profile) {
    const h = await call("GET", "/", p.cookie);
    check(`/ (${p.s}): 200, Kacheln ${JSON.stringify(p.erwartet)}`, h.status === 200 && JSON.stringify(kacheln(h.text)) === JSON.stringify(p.erwartet), `${h.status} ${JSON.stringify(kacheln(h.text))}`);
    if (!p.erwartet.length) check(`/ (${p.s}): Hinweis "kein Modul zugewiesen"`, h.text.includes("data-keine-module"));
    check(`/ (${p.s}): Kopfzeile mit Profil und genau einem Abmelden`, h.text.includes("data-app-header") && h.text.includes('href="/profil"') && abmelden(h.text) === 1);
  }
  let h = await call("GET", "/", aNeu);
  check("/ (globaler Admin ohne Modulrollen): Kachel Mitglieder", JSON.stringify(kacheln(h.text)) === JSON.stringify(["mitglieder"]), JSON.stringify(kacheln(h.text)));
  h = await call("GET", "/", profile[0].cookie);
  check("Kopfzeile (nur PSA): kein Link auf /funk oder /food/admin", h.text.includes('href="/psa"') && !h.text.includes('href="/funk"') && !h.text.includes('href="/food/admin"'));
  h = await call("GET", "/");
  check("/ ohne Cookie → 307 /login", h.status === 307 && h.loc.endsWith("/login"), `${h.status} ${h.loc}`);
  h = await call("GET", "/setup");
  check("/setup bei vorhandenen Benutzern → 307 /login", h.status === 307 && h.loc.endsWith("/login"));
  h = await call("GET", "/setup", aNeu);
  check("/setup auch mit Session → 307 /login", h.status === 307 && h.loc.endsWith("/login"));
  h = await call("GET", "/?kein_zugriff=psa", profile[2].cookie);
  check("Hinweis ?kein_zugriff=psa bleibt erhalten", h.status === 200 && h.text.includes("Kein Zugriff auf das Modul") && h.text.includes("PSA-Verwaltung"));
  h = await call("GET", "/?kein_zugriff=%3Cscript%3Exss4711", profile[2].cookie);
  check("Kein reflektierter Freitext im Hinweis", !h.text.includes("<script>xss4711") && !h.text.includes("Kein Zugriff auf das Modul"));
  for (const [pfad, cookie] of [["/psa", profile[0].cookie], ["/psa/verlauf", profile[0].cookie], ["/funk", profile[1].cookie], ["/food/admin", profile[1].cookie], ["/mitglieder", aNeu], ["/profil", profile[2].cookie]]) {
    h = await call("GET", pfad, cookie);
    check(`${pfad}: 200, gemeinsame Kopfzeile, genau ein Abmelden, kein PIN-Hash`, h.status === 200 && h.text.includes("data-app-header") && abmelden(h.text) === 1 && !HASH.test(h.text), `${h.status}`);
  }
  h = await call("GET", "/food/admin", profile[3].cookie);
  check("Food-Mitglied auf /food/admin → 307 /food", h.status === 307 && h.loc.endsWith("/food"), `${h.status} ${h.loc}`);
  h = await call("GET", "/psa", profile[2].cookie);
  check("Ohne PSA-Rolle: /psa → 307 /?kein_zugriff=psa", h.status === 307 && h.loc.includes("kein_zugriff=psa"), `${h.status} ${h.loc}`);
  // Selbst signierte Tokens (JWT_SECRET aus der Umgebung): abgelaufen bzw. ohne benutzer_id/tv sind ungültig
  if (process.env.JWT_SECRET) {
    const { SignJWT } = await imp("jose");
    const key = new TextEncoder().encode(process.env.JWT_SECRET);
    const sign = (claims, exp) => new SignJWT({ app_role: "User", kamerad_id: adm.kamerad, kamerad_name: "x", psa_rolle: "Admin", ...claims })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" }).setSubject(adm.name).setIssuedAt(Math.floor(Date.now() / 1000) - 7200).setExpirationTime(exp).sign(key);
    const abgelaufen = `fw_jwt=${await sign({ benutzer_id: adm.benutzer, tv: 0 }, Math.floor(Date.now() / 1000) - 3600)}`;
    h = await call("GET", "/psa", abgelaufen);
    check("Abgelaufenes JWT: /psa → 307 /login", h.status === 307 && h.loc.endsWith("/login"), `${h.status} ${h.loc}`);
    const ohneClaims = `fw_jwt=${await sign({}, "1h")}`;
    check("Gültig signiertes JWT ohne benutzer_id und tv → 401", (await probe(ohneClaims)) === 401);
    const falscheTv = `fw_jwt=${await sign({ benutzer_id: adm.benutzer, tv: 9999 }, "1h")}`;
    check("Gültig signiertes JWT mit falscher token_version → 401", (await probe(falscheTv)) === 401);
  } else console.log("ÜBERSPRUNGEN: JWT-Prüfungen, JWT_SECRET nicht gesetzt");
  h = await call("GET", "/psa", `fw_jwt=${"x".repeat(20)}.abc.def`);
  check("Ungültiges JWT: /psa → 307 /login", h.status === 307 && h.loc.endsWith("/login"), `${h.status} ${h.loc}`);
} catch (e) {
  fail++; console.log("ABBRUCH:", e.message);
} finally {
  try {
    if (namen.length) await owner`delete from core.login_attempts where benutzername in ${owner(namen.map((n) => n.toLowerCase()))}`;
    if (ids.kam.length) await owner`delete from core.mitglieder_audit where kamerad_id in ${owner(ids.kam)}`;
    if (ids.kam.length) await owner`delete from core.benutzer where kamerad_id in ${owner(ids.kam)}`;
    if (ids.kam.length) await owner`delete from core.kameraden where id in ${owner(ids.kam)}`;
    const [{ n }] = await owner`select count(*)::int n from core.kameraden where name like ${stamp + "-%"}`;
    console.log(`Aufräumen: ${ids.kam.length} Kameraden samt Zugängen und Protokoll; Rest mit Zeitstempel ${stamp}: ${n}`);
  } catch (e) { console.log("AUFRÄUMEN FEHLGESCHLAGEN:", e.message, JSON.stringify({ ids, namen })); fail++; }
  check("Konto FWHUB_ADMIN_USER vorher = nachher", vorher === (await adminSnap()));
  await app.end({ timeout: 5 }); await owner.end({ timeout: 5 });
}
console.log(fail === 0 ? "\nALLE TESTS OK" : `\n${fail} TEST(S) FEHLGESCHLAGEN`);
process.exit(fail ? 1 : 0);
