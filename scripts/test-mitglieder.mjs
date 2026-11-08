// Mitgliederverwaltung per HTTP: API (/api/mitglieder*) je Rolle, Validierung,
// Konflikte, Änderungsprotokoll.
//
// Aufruf:  node scripts/test-mitglieder.mjs
// Env wie bei scripts/test-haertung.mjs (aus .env.local, falls vorhanden):
//   MIGRATE_DATABASE_URL  Owner: Testkonten anlegen, kontrollieren, aufräumen
//   TEST_BASE             optional, Standard http://localhost:3100
// Voraussetzung: lokaler Dev-Server (npx next dev --webpack -p 3100) auf derselben
// Datenbank. Jede Rolle bekommt ein eigenes Testkonto, angemeldet wird über die
// echte Login-Route (Cookie). Aufgeräumt wird über gemerkte IDs und exakte Namen.
// Bricht ab, wenn Datenbank oder Server nicht lokal sind. Secrets werden nie
// ausgegeben.
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const P = resolve(fileURLToPath(new URL("..", import.meta.url)));
if (existsSync(`${P}/.env.local`)) process.loadEnvFile(`${P}/.env.local`);
const req = createRequire(`${P}/package.json`);
const imp = async (m) => import(pathToFileURL(req.resolve(m)).href);
const postgres = (await imp("postgres")).default;
const bcrypt = (await imp("bcryptjs")).default;
const BASE = process.env.TEST_BASE || "http://localhost:3100";

const lokal = (h) => ["localhost", "127.0.0.1", "[::1]", "::1"].includes(h);
if (!process.env.MIGRATE_DATABASE_URL) { console.error("Abbruch: MIGRATE_DATABASE_URL ist nicht gesetzt."); process.exit(2); }
if (!lokal(new URL(process.env.MIGRATE_DATABASE_URL).hostname) || !lokal(new URL(BASE).hostname)) {
  console.error("Abbruch: Datenbank und Server müssen lokal sein (localhost / 127.0.0.1).");
  process.exit(2);
}
const owner = postgres(process.env.MIGRATE_DATABASE_URL, { max: 1, onnotice: () => {} });

const stamp = `mg${Date.now().toString(36)}`;
const PIN = "121212";
let fail = 0;
const check = (n, c, i = "") => { if (!c) fail++; console.log(`${c ? "OK  " : "FEHLER"} ${n}${i ? " — " + i : ""}`); };
const ids = { kam: [], ben: [], stueck: [], typ: [], geraet: [], zuteilung: [] }, namen = [];
let ipZaehler = 0;
const hash = await bcrypt.hash(PIN, 12);

async function konto(suffix, { appRolle = "User", psa = null, food = null, funk = null, karte = null, login = true } = {}) {
  const name = `${stamp}-${suffix}`; namen.push(name);
  const [k] = await owner`insert into core.kameraden (name, vorname, aktiv, psa_rolle, food_rolle, funk_rolle, karten_id, personalnummer, dienstgrad)
    values (${name}, 'Mg', true, ${psa}, ${food}, ${funk}, ${karte}, ${"P" + stamp + suffix}, 'HFM') returning id`;
  ids.kam.push(k.id);
  let benutzer = null;
  if (login) {
    const [b] = await owner`insert into core.benutzer (benutzername, pin, rolle, kamerad_id) values (${name}, ${hash}, ${appRolle}, ${k.id}) returning id`;
    ids.ben.push(b.id); benutzer = b.id;
  }
  return { name, kamerad: k.id, benutzer, cookie: null };
}
async function anmelden(k) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": `203.0.113.${++ipZaehler + 100}` },
    body: JSON.stringify({ benutzername: k.name, pin: PIN }),
  });
  if (r.status !== 200) throw new Error(`Anmeldung ${k.name} → ${r.status}`);
  k.cookie = (r.headers.get("set-cookie") || "").split(";")[0];
  return k;
}
async function api(method, pfad, cookie, body) {
  const r = await fetch(`${BASE}${pfad}`, {
    method, redirect: "manual",
    headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* keine JSON-Antwort */ }
  return { status: r.status, json, text };
}
const eintrag = (liste, id) => liste?.mitglieder?.find((m) => m.id === id);
const audit = (kamerad) => owner`select abschnitt, feld, alt, neu, akteur_kamerad_id, akteur_name from core.mitglieder_audit where kamerad_id = ${kamerad} order by id`;

try {
  // Konten: eines je Rolle, dazu eine Zielperson mit Login und Karten-ID und eine ohne Login
  const admin = await konto("admin", { appRolle: "Admin" });             // globaler Admin ohne Modulrollen
  const kw = await konto("kw", { psa: "Kleiderwart" });
  const psaUser = await konto("psau", { psa: "User" });
  const kueche = await konto("kueche", { food: "Admin" });
  const funkGw = await konto("funkgw", { funk: "Gerätewart" });
  const funkMit = await konto("funkmit", { funk: "Mitglied" });
  const ohne = await konto("ohne");
  const ziel = await konto("ziel", { psa: "User", karte: `K-${stamp}` });
  const ohneLogin = await konto("kein", { login: false });
  for (const k of [admin, kw, psaUser, kueche, funkGw, funkMit, ohne]) await anmelden(k);

  // Modul-Testdaten für die Zielperson: ein ausgegebenes Stück (Prüfung fällig) und ein zugeteiltes Funkgerät
  let [typ] = await owner`select id from psa.ausruestungstypen order by id limit 1`;
  if (!typ) { [typ] = await owner`insert into psa.ausruestungstypen (bezeichnung) values (${stamp + "-typ"}) returning id`; ids.typ.push(typ.id); }
  const [stueck] = await owner`insert into psa.ausruestungstuecke (ausruestungstyp_id, seriennummer, status, kamerad_id, naechste_pruefung) values (${typ.id}, ${stamp + "-sn"}, 'Ausgegeben', ${ziel.kamerad}, '2020-01-01') returning id`;
  ids.stueck.push(stueck.id);
  const geraetSn = `${stamp}-fg`;
  const [geraet] = await owner`insert into fw_funk.devices (serial_number, device_type) values (${geraetSn}, 'sepura') returning id`;
  ids.geraet.push(geraet.id);
  const [zuteilung] = await owner`insert into fw_funk.device_assignments (device_id, owner_id) values (${geraet.id}, ${ziel.kamerad}) returning id`;
  ids.zuteilung.push(zuteilung.id);

  // ── Zugriff ────────────────────────────────────────────────────────────────
  let r = await api("GET", "/api/mitglieder", null);
  check("ohne Anmeldung: Liste → 401", r.status === 401);
  r = await api("POST", "/api/mitglieder", null, { vorname: "A", name: "B" });
  check("ohne Anmeldung: Anlegen → 401", r.status === 401);
  for (const [n, k] of [["PSA-User", psaUser], ["Funk-Mitglied", funkMit], ["ohne Rolle", ohne]]) {
    r = await api("GET", "/api/mitglieder", k.cookie);
    check(`${n}: Liste → 403`, r.status === 403);
    r = await api("GET", `/api/mitglieder/${ziel.kamerad}`, k.cookie);
    check(`${n}: fremdes Mitglied → 403`, r.status === 403);
    r = await api("GET", `/api/mitglieder/${k.kamerad}`, k.cookie);
    check(`${n}: eigenes Mitglied → 200 ohne Zugang/Rollen/Karten-ID`, r.status === 200 && r.json.mitglied.id === k.kamerad && !("zugang" in r.json.mitglied) && !("rollen" in r.json.mitglied) && !("kartenId" in r.json.mitglied));
  }

  // ── Projektion je Rolle ────────────────────────────────────────────────────
  const sicht = {};
  for (const [n, k] of [["admin", admin], ["kw", kw], ["kueche", kueche], ["funkGw", funkGw]]) {
    r = await api("GET", "/api/mitglieder", k.cookie);
    sicht[n] = r;
    check(`${n}: Liste → 200 mit der Zielperson`, r.status === 200 && !!eintrag(r.json, ziel.kamerad), String(r.status));
  }
  const grund = (m) => m.vorname === "Mg" && m.dienstgrad === "HFM" && m.personalnummer === `P${stamp}ziel` && m.aktiv === true;
  for (const n of ["admin", "kw", "kueche", "funkGw"]) check(`${n}: Stammdaten vollständig`, grund(eintrag(sicht[n].json, ziel.kamerad)));
  for (const n of ["kw", "kueche", "funkGw"]) {
    const m = eintrag(sicht[n].json, ziel.kamerad);
    check(`${n}: ohne Zugang und Rollen`, !("zugang" in m) && !("rollen" in m));
  }
  check("kw: ohne Karten-ID", !("kartenId" in eintrag(sicht.kw.json, ziel.kamerad)));
  check("funkGw: ohne Karten-ID", !("kartenId" in eintrag(sicht.funkGw.json, ziel.kamerad)));
  check("kueche: mit Karten-ID", eintrag(sicht.kueche.json, ziel.kamerad).kartenId === `K-${stamp}`);
  const az = eintrag(sicht.admin.json, ziel.kamerad), ak = eintrag(sicht.admin.json, ohneLogin.kamerad);
  check("admin: Zugang der Zielperson (Name, Rolle, aktiv)", az.zugang?.benutzername === ziel.name && az.zugang.rolle === "User" && az.zugang.aktiv === true);
  check("admin: Person ohne Login hat zugang = null", ak.zugang === null);
  check("admin: Rollen sichtbar", az.rollen?.psa === "User" && az.rollen.food === null);
  check("admin ohne Küchenrolle: keine Karten-ID", !("kartenId" in az));
  check("PIN oder Hash steht in keiner Antwort", !Object.values(sicht).some((s) => /"pin"|\$2[aby]\$/.test(s.text)));

  // ── Filter und Suche ───────────────────────────────────────────────────────
  r = await api("GET", `/api/mitglieder?status=ohne-login&suche=${stamp}`, admin.cookie);
  check("Filter ohne-login: genau die Person ohne Login", r.status === 200 && r.json.mitglieder.length === 1 && r.json.mitglieder[0].id === ohneLogin.kamerad, `${r.json?.mitglieder?.length}`);
  r = await api("GET", `/api/mitglieder?suche=${encodeURIComponent(`P${stamp}ziel`)}`, kw.cookie);
  check("Suche nach Personalnummer", r.json?.mitglieder?.length === 1 && r.json.mitglieder[0].id === ziel.kamerad);
  r = await api("GET", `/api/mitglieder?suche=${encodeURIComponent(ziel.name.toUpperCase())}`, kw.cookie);
  check("Suche ohne Beachtung der Groß-/Kleinschreibung", r.json?.mitglieder?.some((m) => m.id === ziel.kamerad));
  r = await api("GET", "/api/mitglieder?status=ohne-login", kw.cookie);
  check("Filter ohne-login für Nicht-Admin → 400", r.status === 400);
  r = await api("GET", "/api/mitglieder?status=quatsch", admin.cookie);
  check("unbekannter Status → 400", r.status === 400);

  // ── Anlegen ────────────────────────────────────────────────────────────────
  const neu = { vorname: "Neu", name: `${stamp}-neu`, dienstgrad: "OFM", email: "neu@example.org", personalnummer: `PN${stamp}` };
  for (const [n, k] of [["Kleiderwart", kw], ["Küchen-Admin", kueche], ["Funk-Gerätewart", funkGw]]) {
    r = await api("POST", "/api/mitglieder", k.cookie, neu);
    check(`${n}: Anlegen → 403`, r.status === 403);
  }
  r = await api("POST", "/api/mitglieder", admin.cookie, { vorname: "", name: "X" });
  check("Anlegen ohne Vornamen → 400", r.status === 400);
  r = await api("POST", "/api/mitglieder", admin.cookie, { ...neu, email: "kaputt" });
  check("Anlegen mit ungültiger E-Mail → 400", r.status === 400);
  r = await api("POST", "/api/mitglieder", admin.cookie, { ...neu, login: { benutzername: "x y", pin: "123456" } });
  check("Anlegen mit ungültigem Benutzernamen → 400, nichts angelegt", r.status === 400);
  r = await api("POST", "/api/mitglieder", admin.cookie, neu);
  check("Admin legt Mitglied ohne Login an → 201", r.status === 201 && r.json.mitglied.name === neu.name && r.json.mitglied.zugang === null, String(r.status));
  const neuId = r.json?.mitglied?.id; if (neuId) ids.kam.push(neuId);
  r = await api("POST", "/api/mitglieder", admin.cookie, { ...neu, name: `${stamp}-neu2` });
  check("doppelte Personalnummer → 409", r.status === 409 && /Personalnummer/.test(r.json?.error ?? ""), `${r.status} ${r.json?.error}`);
  const loginName = `${stamp}-lg`; namen.push(loginName);
  r = await api("POST", "/api/mitglieder", admin.cookie, { vorname: "Mit", name: `${stamp}-mitlogin`, login: { benutzername: loginName, pin: "654321", rolle: "User" } });
  check("Admin legt Mitglied MIT Login an → 201", r.status === 201 && r.json.mitglied.zugang?.benutzername === loginName && r.json.mitglied.zugang.aktiv === true, String(r.status));
  const mlId = r.json?.mitglied?.id; if (mlId) ids.kam.push(mlId);
  const bRow = mlId ? (await owner`select id from core.benutzer where kamerad_id = ${mlId}`)[0] : null; if (bRow) ids.ben.push(bRow.id);
  r = await api("POST", "/api/mitglieder", admin.cookie, { vorname: "Zwei", name: `${stamp}-zwei`, login: { benutzername: loginName.toUpperCase(), pin: "654321" } });
  check("doppelter Benutzername (Groß-/Kleinschreibung egal) → 409, kein Mitglied angelegt", r.status === 409 && (await owner`select id from core.kameraden where name = ${stamp + "-zwei"}`).length === 0, `${r.status} ${r.json?.error}`);
  r = await api("POST", "/api/mitglieder", admin.cookie, { vorname: "Drei", name: `${stamp}-drei`, login: { benutzername: `${stamp}-l3`, pin: "123" } });
  check("PIN zu kurz → 400, kein Mitglied angelegt", r.status === 400 && (await owner`select id from core.kameraden where name = ${stamp + "-drei"}`).length === 0);
  r = await api("POST", "/api/mitglieder", admin.cookie, { vorname: "Rollen", name: `${stamp}-rollen`, psaRolle: "Admin" });
  check("Anlegen mit Rollen im Body → 400 mit Hinweis, nichts angelegt", r.status === 400 && r.json?.error?.includes("Rollen über /mitglieder/[id] → Rollen") && (await owner`select id from core.kameraden where name = ${stamp + "-rollen"}`).length === 0, `${r.status} ${r.json?.error}`);
  r = await api("POST", "/api/mitglieder", admin.cookie, { vorname: "Karte", name: `${stamp}-karte`, kartenId: "x" });
  check("Anlegen mit Karten-ID im Body → 400 mit Hinweis, nichts angelegt", r.status === 400 && r.json?.error?.includes("Karten-ID über den Abschnitt Küche") && (await owner`select id from core.kameraden where name = ${stamp + "-karte"}`).length === 0, `${r.status} ${r.json?.error}`);

  // ── Ändern, Deaktivieren, Reaktivieren ─────────────────────────────────────
  r = await api("PATCH", `/api/mitglieder/${ziel.kamerad}`, kw.cookie, { dienstgrad: "X" });
  check("Kleiderwart: Ändern → 403", r.status === 403);
  r = await api("PATCH", `/api/mitglieder/${ziel.kamerad}`, kueche.cookie, { dienstgrad: "X" });
  check("Küchen-Admin: Ändern → 403", r.status === 403);
  r = await api("PATCH", `/api/mitglieder/${ziel.kamerad}`, admin.cookie, {});
  check("Ändern ohne Felder → 400", r.status === 400);
  r = await api("PATCH", `/api/mitglieder/abc`, admin.cookie, { dienstgrad: "X" });
  check("Ändern mit ungültiger id → 400", r.status === 400);
  r = await api("PATCH", `/api/mitglieder/2147483000`, admin.cookie, { dienstgrad: "X" });
  check("Ändern eines unbekannten Mitglieds → 404", r.status === 404);
  r = await api("PATCH", `/api/mitglieder/${ziel.kamerad}`, admin.cookie, { dienstgrad: "X", psaRolle: "Admin" });
  check("Ändern mit Rollen im Body → 400 mit Hinweis", r.status === 400 && r.json?.error?.includes("Rollen über /mitglieder/[id] → Rollen"), `${r.status} ${r.json?.error}`);
  r = await api("PATCH", `/api/mitglieder/${ziel.kamerad}`, admin.cookie, { dienstgrad: "X", kartenId: "geklaut" });
  check("Ändern mit Karten-ID im Body → 400 mit Hinweis", r.status === 400 && r.json?.error?.includes("Karten-ID über den Abschnitt Küche"), `${r.status} ${r.json?.error}`);
  r = await api("PATCH", `/api/mitglieder/${ziel.kamerad}`, admin.cookie, { dienstgrad: "OBM" });
  const zRow = (await owner`select psa_rolle, karten_id, dienstgrad from core.kameraden where id = ${ziel.kamerad}`)[0];
  check("Admin ändert den Dienstgrad → 200", r.status === 200 && r.json.mitglied.dienstgrad === "OBM" && zRow.dienstgrad === "OBM");
  check("Nach den abgelehnten Anfragen sind Rollen und Karten-ID unverändert", zRow.psa_rolle === "User" && zRow.karten_id === `K-${stamp}`);
  r = await api("PATCH", `/api/mitglieder/${ziel.kamerad}`, admin.cookie, { personalnummer: `P${stamp}kw` });
  check("Personalnummer einer anderen Person → 409", r.status === 409, `${r.status} ${r.json?.error}`);
  r = await api("PATCH", `/api/mitglieder/${ziel.kamerad}`, admin.cookie, { aktiv: false });
  const zugang = (await owner`select aktiv from core.benutzer where id = ${ziel.benutzer}`)[0];
  check("Deaktivieren sperrt den Login der Person (Trigger)", r.status === 200 && r.json.mitglied.aktiv === false && r.json.mitglied.zugang.aktiv === false && zugang.aktiv === false);
  r = await api("PATCH", `/api/mitglieder/${ziel.kamerad}`, admin.cookie, { aktiv: true });
  const zugang2 = (await owner`select aktiv from core.benutzer where id = ${ziel.benutzer}`)[0];
  check("Reaktivieren öffnet den Login NICHT wieder", r.status === 200 && r.json.mitglied.aktiv === true && zugang2.aktiv === false);
  r = await api("PATCH", `/api/mitglieder/${admin.kamerad}`, admin.cookie, { aktiv: false });
  check("Den eigenen Kameraden deaktivieren → 409 mit Hinweis", r.status === 409 && /eigene/i.test(r.json?.error ?? ""), `${r.status} ${r.json?.error}`);
  const aRow = (await owner`select aktiv from core.kameraden where id = ${admin.kamerad}`)[0];
  check("Der eigene Kamerad bleibt aktiv", aRow.aktiv === true);

  // ── Änderungsprotokoll ─────────────────────────────────────────────────────
  const aud = await audit(ziel.kamerad);
  const dg = aud.find((a) => a.feld === "dienstgrad");
  check("Protokoll: Dienstgrad alt/neu mit Akteur (Admin)", dg?.alt === "HFM" && dg?.neu === "OBM" && dg.akteur_kamerad_id === admin.kamerad && dg.akteur_name === `Mg ${admin.name}`);
  check("Protokoll: Deaktivieren und Reaktivieren des Kameraden", aud.filter((a) => a.feld === "aktiv" && a.abschnitt === "stammdaten").length === 2);
  check("Protokoll: Zugang gesperrt durch die Deaktivierung", aud.some((a) => a.abschnitt === "zugang" && a.feld === "aktiv" && a.neu === "false"));
  check("Protokoll: Rollen unverändert (kein Rollen-Eintrag)", !aud.some((a) => a.abschnitt === "rollen"));
  if (neuId) {
    const an = await audit(neuId);
    check("Protokoll: neues Mitglied 'angelegt' mit Akteur", an.some((a) => a.feld === "angelegt" && a.neu === `Neu ${stamp}-neu` && a.akteur_kamerad_id === admin.kamerad));
  }
  if (mlId) {
    const ml = await audit(mlId);
    check("Protokoll: Login angelegt, ohne PIN", ml.some((a) => a.feld === "login angelegt" && a.neu === `${loginName} (User)`) && !JSON.stringify(ml).includes("654321") && !/\$2[aby]\$/.test(JSON.stringify(ml)));
  }

  // ── Seiten ─────────────────────────────────────────────────────────────────
  const seite = async (pfad, cookie) => {
    const res = await fetch(`${BASE}${pfad}`, { redirect: "manual", headers: cookie ? { cookie } : {} });
    return { status: res.status, loc: res.headers.get("location") || "", html: await res.text() };
  };
  const hat = (html, text) => html.includes(text);
  const abschnitteIn = (html) => [...html.matchAll(/data-abschnitt="([a-z]+)"/g)].map((m) => m[1]);
  // Dieselbe Person wie oben, aber als sauber angelegte Seite: aktiv, mit Login
  await owner`update core.kameraden set aktiv = true where id = ${ziel.kamerad}`;
  await owner`update core.benutzer set aktiv = true where id = ${ziel.benutzer}`;

  for (const pfad of ["/mitglieder", `/mitglieder/${ziel.kamerad}`, "/admin/benutzer"]) {
    const s = await seite(pfad, null);
    check(`ohne Anmeldung: ${pfad} → /login`, s.status === 307 && s.loc.endsWith("/login"), `${s.status} ${s.loc}`);
  }
  let s = await seite("/mitglieder", ohne.cookie);
  check("ohne Rolle: /mitglieder → Startseite mit Hinweis", s.status === 307 && s.loc.endsWith("/?kein_zugriff=mitglieder"), `${s.status} ${s.loc}`);
  s = await seite(`/mitglieder/${ziel.kamerad}`, psaUser.cookie);
  check("PSA-User: fremde Person → Startseite mit Hinweis", s.status === 307 && s.loc.endsWith("/?kein_zugriff=mitglieder"), `${s.status} ${s.loc}`);
  s = await seite(`/mitglieder/${ohne.kamerad}`, ohne.cookie);
  check("ohne Rolle: die eigene Person → /profil", s.status === 307 && s.loc.endsWith("/profil"), `${s.status} ${s.loc}`);
  s = await seite("/admin/benutzer", ohne.cookie);
  check("alte Adresse /admin/benutzer (angemeldet) → /mitglieder", s.status === 307 && s.loc.endsWith("/mitglieder"), `${s.status} ${s.loc}`);
  s = await seite("/?kein_zugriff=mitglieder", ohne.cookie);
  check("Startseite zeigt den Hinweis für das Modul Mitglieder", s.status === 200 && hat(s.html, "Kein Zugriff auf das Modul") && hat(s.html, "Mitglieder"));
  check("ohne Rolle: keine Kachel und kein Menüpunkt Mitglieder", !hat(s.html, 'data-kachel="mitglieder"') && !hat(s.html, 'href="/mitglieder"'));

  // Liste je Rolle
  for (const [n, k] of [["Kleiderwart", kw], ["Küchen-Admin", kueche], ["Funk-Gerätewart", funkGw]]) {
    s = await seite("/mitglieder", k.cookie);
    check(`${n}: /mitglieder → 200 mit Liste und Menüpunkt`, s.status === 200 && hat(s.html, "mitglieder-suche") && hat(s.html, 'href="/mitglieder"'), String(s.status));
    check(`${n}: ohne "Neues Mitglied", ohne Aktionen, ohne Login-Spalte`, !hat(s.html, "Neues Mitglied") && !hat(s.html, "Aktionen für") && !hat(s.html, "kein Login"));
    check(`${n}: Kopfzeile ohne "Benutzerverwaltung"`, !hat(s.html, "Benutzerverwaltung"));
    s = await seite("/", k.cookie);
    check(`${n}: Startseite hat die Kachel Mitglieder`, hat(s.html, 'data-kachel="mitglieder"'));
    s = await seite(`/mitglieder/${ziel.kamerad}`, k.cookie);
    const erwartet = { Kleiderwart: "psa", "Küchen-Admin": "food", "Funk-Gerätewart": "funk" }[n];
    check(`${n}: Detailseite → 200, Stammdaten (schreibgeschützt) und der Abschnitt ${erwartet}`,
      s.status === 200 && JSON.stringify(abschnitteIn(s.html)) === JSON.stringify(["stammdaten", erwartet]) && !hat(s.html, 'id="stamm-vorname"') && hat(s.html, ziel.name), `${s.status} ${abschnitteIn(s.html)}`);
    check(`${n}: Detailseite ohne Zugang, Rollen, Protokoll, PIN-Hash`, !hat(s.html, "reset-pin") && !hat(s.html, "Änderungsverlauf") && !hat(s.html, "$2a$") && !hat(s.html, "$2b$"));
  }

  // Admin
  s = await seite("/mitglieder", admin.cookie);
  check("Admin: Liste mit Neues Mitglied, Aktionen-Menü und Login-Spalte", s.status === 200 && hat(s.html, "Neues Mitglied") && hat(s.html, "Aktionen für") && hat(s.html, "kein Login"), String(s.status));
  check("Admin: Kopfzeile zeigt Mitglieder, nicht mehr Benutzerverwaltung", hat(s.html, 'href="/mitglieder"') && !hat(s.html, "Benutzerverwaltung"));
  s = await seite(`/mitglieder/${ziel.kamerad}`, admin.cookie);
  const ab = abschnitteIn(s.html);
  check("Admin: Detailseite mit Stammdaten, Zugang, Rollen und Verlauf in dieser Reihenfolge", s.status === 200 && JSON.stringify(ab) === '["stammdaten","zugang","rollen","verlauf"]', `${s.status} ${ab}`);
  check("Admin: Stammdaten sind bearbeitbar (Eingabefeld, Deaktivieren)", hat(s.html, 'id="stamm-vorname"') && hat(s.html, "Deaktivieren"));
  check("Admin: Zugang zeigt den Benutzernamen der Person und die PIN-Funktion", hat(s.html, ziel.name) && hat(s.html, "PIN zurücksetzen"));
  check("Admin: Rollen-Auswahl für alle vier Module", ["PSA", "Küche", "Führerschein", "Funk"].every((x) => hat(s.html, x)));
  check("Admin: kein PIN-Hash und kein Login-PIN im HTML", !hat(s.html, "$2a$") && !hat(s.html, "$2b$"));
  s = await seite(`/mitglieder/${ohneLogin.kamerad}`, admin.cookie);
  check("Admin: Person ohne Login → Hinweis und Formular zum Anlegen", s.status === 200 && hat(s.html, "hat noch keinen Login") && hat(s.html, "Login anlegen") && hat(s.html, "kein Login"));
  s = await seite("/mitglieder/2147483000", admin.cookie);
  check("Admin: unbekannte Person → 404", s.status === 404, String(s.status));
  s = await seite("/mitglieder/abc", admin.cookie);
  check("Admin: ungültige id → 404", s.status === 404, String(s.status));
  s = await seite(`/mitglieder/${admin.kamerad}`, admin.cookie);
  check("Admin: die eigene Person bleibt bearbeitbar und nicht deaktivierbar", s.status === 200 && hat(s.html, "kannst du nicht deaktivieren") && hat(s.html, "(du)"));

  // ── Modul-Abschnitte (Paket 4) ─────────────────────────────────────────────
  s = await seite(`/mitglieder/${ziel.kamerad}`, kw.cookie);
  check("PSA: Größenfelder sind für den Kleiderwart bearbeitbar", hat(s.html, 'id="psa-jackeGroesse"') && hat(s.html, "Größen speichern"));
  check("PSA: ausgegebenes Stück erscheint mit Seriennummer", hat(s.html, `${stamp}-sn`));
  check("PSA: überfällige Prüfung ist als fällig markiert", hat(s.html, "(fällig)") && hat(s.html, "01.01.2020"));
  check("PSA: kein Küche- und kein Funk-Inhalt beim Kleiderwart", !hat(s.html, "karten-id") && !hat(s.html, geraetSn) && !hat(s.html, "QR-Link"));
  s = await seite(`/mitglieder/${ziel.kamerad}`, kueche.cookie);
  check("Küche: Karten-ID im Eingabefeld, Scan- und QR-Funktion", hat(s.html, `K-${stamp}`) && hat(s.html, "Karte scannen") && hat(s.html, "QR-Link erzeugen"));
  check("Küche: kein PSA- und kein Funk-Inhalt beim Küchen-Admin", !hat(s.html, `${stamp}-sn`) && !hat(s.html, geraetSn) && !hat(s.html, "psa-jackeGroesse"));
  s = await seite(`/mitglieder/${ziel.kamerad}`, funkGw.cookie);
  check("Funk: zugeteiltes Gerät mit Seriennummer, Link zur Geräteverwaltung", hat(s.html, geraetSn) && hat(s.html, "Sepura") && hat(s.html, 'href="/funk"'));
  check("Funk: nur lesend, kein PSA- und Küche-Inhalt", !hat(s.html, `${stamp}-sn`) && !hat(s.html, "karten-id") && !hat(s.html, "psa-jackeGroesse"));
  s = await seite(`/mitglieder/${ohneLogin.kamerad}`, funkGw.cookie);
  check("Funk: Person ohne Gerät → Hinweis", hat(s.html, "Keine Funkgeräte zugeteilt"));
  s = await seite(`/mitglieder/${ziel.kamerad}`, admin.cookie);
  check("Admin ohne Modulrollen sieht keinen Modul-Abschnitt", !abschnitteIn(s.html).some((a) => ["psa", "food", "funk"].includes(a)) && !hat(s.html, `${stamp}-sn`) && !hat(s.html, geraetSn));

  // Größen-API
  const gr = (cookie, id, body) => api("PATCH", `/api/psa/groessen/${id}`, cookie, body);
  r = await gr(null, ziel.kamerad, { jackeGroesse: "L" });
  check("Größen: ohne Anmeldung → 401", r.status === 401);
  for (const [n, k] of [["PSA-User", psaUser], ["Küchen-Admin", kueche], ["Funk-Gerätewart", funkGw], ["ohne Rolle", ohne]]) {
    r = await gr(k.cookie, ziel.kamerad, { jackeGroesse: "L" });
    check(`Größen: ${n} → 401 oder 403`, r.status === 403 || r.status === 401, String(r.status));
  }
  r = await gr(kw.cookie, ziel.kamerad, { jackeGroesse: " L ", hoseGroesse: "52", fleeceGroesse: "" });
  const gRow = (await owner`select jacke_groesse, hose_groesse, fleece_groesse from psa.kamerad_details where kamerad_id = ${ziel.kamerad}`)[0];
  check("Größen: Kleiderwart speichert → 200, getrimmt, leer = null", r.status === 200 && gRow?.jacke_groesse === "L" && gRow.hose_groesse === "52" && gRow.fleece_groesse === null, `${r.status} ${JSON.stringify(gRow)}`);
  r = await gr(kw.cookie, ziel.kamerad, { jackeGroesse: "XL" });
  const gRow2 = (await owner`select jacke_groesse, hose_groesse from psa.kamerad_details where kamerad_id = ${ziel.kamerad}`)[0];
  check("Größen: weiteres Speichern ändert nur die genannten Felder (Upsert)", r.status === 200 && gRow2.jacke_groesse === "XL" && gRow2.hose_groesse === "52");
  r = await gr(kw.cookie, ohneLogin.kamerad, { stiefelGroesse: "44" });
  check("Größen: für eine Person ohne bisherige Größen wird die Zeile angelegt", r.status === 200 && (await owner`select stiefel_groesse from psa.kamerad_details where kamerad_id = ${ohneLogin.kamerad}`)[0]?.stiefel_groesse === "44");
  r = await gr(kw.cookie, ziel.kamerad, { jackeGroesse: "x".repeat(21) });
  check("Größen: zu lang → 400", r.status === 400);
  r = await gr(kw.cookie, ziel.kamerad, {});
  check("Größen: leerer Body → 400", r.status === 400);
  r = await gr(kw.cookie, "abc", { jackeGroesse: "L" });
  check("Größen: ungültige id → 400", r.status === 400);
  r = await gr(kw.cookie, 2147483000, { jackeGroesse: "L" });
  check("Größen: unbekannte Person → 404", r.status === 404);
  const cl = (await owner`select aktion, details from psa.changelog where benutzer = ${kw.name} order by id desc limit 1`)[0];
  check("Größen: Eintrag im PSA-Changelog", cl?.aktion === "Größen bearbeitet" && cl.details === `Mg ${ohneLogin.name}`, JSON.stringify(cl));

  // Karten-ID über die Küche (PUT /api/food/admin/users/[id] -> set_karten_id)
  const karte = (cookie, id, body) => api("PUT", `/api/food/admin/users/${id}`, cookie, body);
  for (const [n, k] of [["Kleiderwart", kw], ["Funk-Gerätewart", funkGw], ["ohne Rolle", ohne]]) {
    r = await karte(k.cookie, ohneLogin.kamerad, { card_id: `X-${stamp}` });
    check(`Karten-ID: ${n} → 403`, r.status === 403 || r.status === 401, String(r.status));
  }
  r = await karte(kueche.cookie, ohneLogin.kamerad, { card_id: `K2-${stamp}` });
  check("Karten-ID: Küchen-Admin setzt die ID → 200", r.status === 200 && (await owner`select karten_id from core.kameraden where id = ${ohneLogin.kamerad}`)[0].karten_id === `K2-${stamp}`, String(r.status));
  r = await karte(kueche.cookie, funkMit.kamerad, { card_id: `K2-${stamp}` });
  check("Karten-ID: dieselbe ID bei einer anderen Person → 409", r.status === 409, `${r.status} ${r.json?.error}`);
  const kaud = await audit(ohneLogin.kamerad);
  check("Karten-ID: Eintrag im Änderungsprotokoll mit dem Küchen-Admin als Akteur", kaud.some((a) => a.feld === "karten_id" && a.neu === `K2-${stamp}` && a.akteur_kamerad_id === kueche.kamerad));
  r = await karte(kueche.cookie, ohneLogin.kamerad, { card_id: null });
  check("Karten-ID: Küchen-Admin entfernt die ID → 200, NULL", r.status === 200 && (await owner`select karten_id from core.kameraden where id = ${ohneLogin.kamerad}`)[0].karten_id === null);
  r = await karte(kueche.cookie, ohneLogin.kamerad, {});
  check("Karten-ID: ohne card_id → 400", r.status === 400);

  // QR-Link (mobile Anmeldung)
  r = await api("POST", "/api/food/admin/mobile-token", kueche.cookie, { kameradId: ziel.kamerad });
  check("QR-Link: Küchen-Admin erzeugt den Link → 200 mit /food/m/...", r.status === 200 && (r.json?.url ?? "").startsWith("/food/m/") && (r.json?.url ?? "").length > 28, String(r.status));
  r = await api("POST", "/api/food/admin/mobile-token", kw.cookie, { kameradId: ziel.kamerad });
  check("QR-Link: Kleiderwart (keine Küchenrolle) → 401 oder 403", r.status === 401 || r.status === 403, String(r.status));

  // ── Module umgestellt (Paket 5) ────────────────────────────────────────────
  // Anmeldung der Zielperson für heute, damit die Küche-Seite ihren Namen zeigt
  const heuteBerlin = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
  await owner`insert into fw_food.registrations (kamerad_id, date) values (${ziel.kamerad}, ${heuteBerlin}) on conflict do nothing`;

  // PSA: Größenübersicht statt Kameradenformular
  s = await seite("/psa", kw.cookie);
  check("PSA: Seite lädt für den Kleiderwart", s.status === 200, String(s.status));
  check("PSA: Größenübersicht (schreibgeschützt) mit Link zu den Mitgliedern", hat(s.html, 'id="groessen"') && hat(s.html, "Übersicht, schreibgeschützt") && hat(s.html, 'href="/mitglieder"'));
  check("PSA: Name in der Übersicht verlinkt auf /mitglieder/[id]", hat(s.html, `href="/mitglieder/${ziel.kamerad}"`));
  check("PSA: Größe der Zielperson steht in der Übersicht (XL)", hat(s.html, ">XL<"));
  check("PSA: kein Kameradenformular mehr (keine Stammdaten-Eingabefelder)", !hat(s.html, 'id="f-vorname"') && !hat(s.html, 'id="f-personalnummer"') && !hat(s.html, 'id="f-kartenId"') && !hat(s.html, 'id="kameraden"'));
  check("PSA: Navigation zeigt Größen statt Kameraden", hat(s.html, 'href="/psa#groessen"') && !hat(s.html, 'href="/psa#kameraden"'));
  check("PSA: Träger in der Ausrüstungstabelle verlinkt", hat(s.html, `${stamp}-sn`) && hat(s.html, `href="/mitglieder/${ziel.kamerad}"`));
  check("PSA: kein PIN-Hash, keine Karten-ID und keine E-Mail im HTML", !hat(s.html, "$2a$") && !hat(s.html, `K-${stamp}`) && !hat(s.html, "@example.org"));
  s = await seite("/psa", psaUser.cookie);
  check("PSA-User: eigene Ausrüstung ohne Größenübersicht und ohne Mitglieder-Links", s.status === 200 && !hat(s.html, 'id="groessen"') && !hat(s.html, "/mitglieder/"));

  // Küche: Personenliste raus, CSV-Import bleibt
  s = await seite("/food/admin", kueche.cookie);
  check("Küche-Verwaltung: Seite lädt für den Küchen-Admin", s.status === 200, String(s.status));
  check("Küche-Verwaltung: CSV-Import bleibt, mit Hinweis auf Mitglieder → Person → Küche", hat(s.html, "Karten-IDs per CSV importieren") && hat(s.html, "csv-import") && hat(s.html, "Mitglieder → Person → Küche"));
  check("Küche-Verwaltung: keine Personenliste, keine Karten-ID, kein QR je Person", !hat(s.html, "Karten-ID-Zuordnung") && !hat(s.html, `K-${stamp}`) && !hat(s.html, ziel.name) && !hat(s.html, "k-search") && !hat(s.html, "QR-Code"));
  r = await api("GET", "/api/food/admin/users", kueche.cookie);
  check("Küche: die Listen-Route /api/food/admin/users gibt es nicht mehr (404)", r.status === 404, String(r.status));
  s = await seite("/food/admin/heute", kueche.cookie);
  check("Küche heute: Name der angemeldeten Person verlinkt auf /mitglieder/[id]", s.status === 200 && hat(s.html, `href="/mitglieder/${ziel.kamerad}"`), String(s.status));

  // Funk: Besitzer in der Geräteliste verlinkt
  s = await seite("/funk", funkGw.cookie);
  check("Funk: Besitzer in der Geräteliste verlinkt auf /mitglieder/[id]", s.status === 200 && hat(s.html, geraetSn) && hat(s.html, `href="/mitglieder/${ziel.kamerad}"`), String(s.status));

  // ── Profil: "Meine Daten" (Paket 6) ────────────────────────────────────────
  await anmelden(ziel);
  const profil = async (k) => seite("/profil", k.cookie);
  s = await profil(ziel);
  check("Profil PSA-User: Meine Daten mit Stammdaten und PSA, sonst nichts", s.status === 200 && hat(s.html, "Meine Daten") && JSON.stringify(abschnitteIn(s.html)) === '["stammdaten","psa"]', `${s.status} ${abschnitteIn(s.html)}`);
  check("Profil PSA-User: PSA schreibgeschützt (keine Eingabefelder, kein Speichern)", !hat(s.html, 'id="psa-jackeGroesse"') && !hat(s.html, "Größen speichern") && !hat(s.html, 'id="stamm-vorname"'));
  check("Profil PSA-User: eigene Größe, eigenes Stück und fällige Prüfung sichtbar", hat(s.html, "XL") && hat(s.html, `${stamp}-sn`) && hat(s.html, "(fällig)"));
  check("Profil PSA-User: ohne Zugang, Rollen, Verlauf, Küche und Funk", !hat(s.html, "Änderungsverlauf") && !hat(s.html, "reset-pin") && !hat(s.html, "QR-Link") && !hat(s.html, geraetSn));
  check("Profil PSA-User: PIN-Änderung bleibt (Formular), kein PIN-Hash", hat(s.html, "PIN") && !hat(s.html, "$2a$") && !hat(s.html, "$2b$"));
  s = await profil(funkMit);
  check("Profil Funk-Mitglied: Stammdaten und Funk (eigene Geräte, hier keine)", JSON.stringify(abschnitteIn(s.html)) === '["stammdaten","funk"]' && hat(s.html, "Keine Funkgeräte zugeteilt"), `${abschnitteIn(s.html)}`);
  s = await profil(ohne);
  check("Profil ohne Rolle: nur Stammdaten", s.status === 200 && JSON.stringify(abschnitteIn(s.html)) === '["stammdaten"]', `${abschnitteIn(s.html)}`);
  s = await profil(admin);
  check("Profil globaler Admin: nur Stammdaten, ohne Bearbeiten, Zugang, Rollen und Verlauf", JSON.stringify(abschnitteIn(s.html)) === '["stammdaten"]' && !hat(s.html, 'id="stamm-vorname"') && !hat(s.html, "Änderungsverlauf") && !hat(s.html, "reset-pin"), `${abschnitteIn(s.html)}`);
  s = await profil(kw);
  check("Profil Kleiderwart: Stammdaten und PSA, im Profil trotzdem nur lesend", JSON.stringify(abschnitteIn(s.html)) === '["stammdaten","psa"]' && !hat(s.html, 'id="psa-jackeGroesse"') && !hat(s.html, "Größen speichern"), `${abschnitteIn(s.html)}`);
  s = await profil(kueche);
  check("Profil Küchen-Admin: nur Stammdaten (Karten-ID und QR-Link gehören nicht ins Profil)", JSON.stringify(abschnitteIn(s.html)) === '["stammdaten"]' && !hat(s.html, `K-${stamp}`) && !hat(s.html, "QR-Link"), `${abschnitteIn(s.html)}`);

  // ── Paket 7: alte Schreibrouten /api/psa/kameraden sind entfernt, GET bleibt ──
  for (const m of ["POST", "PATCH", "DELETE"]) {
    for (const [n, k] of [["Kleiderwart", kw], ["globaler Admin", admin]]) {
      s = await api(m, "/api/psa/kameraden", k.cookie, { name: "x" });
      check(`${m} /api/psa/kameraden als ${n} → 405 (Route entfernt)`, s.status === 405, `${s.status}`);
    }
  }
  s = await api("GET", "/api/psa/kameraden?nurAktiv=true", kw.cookie);
  check("GET /api/psa/kameraden (Auswahllisten) liefert weiter Kameraden", s.status === 200 && Array.isArray(s.json?.kameraden) && s.json.kameraden.length > 0, `${s.status}`);
  s = await api("GET", "/api/psa/kameraden", undefined);
  check("GET /api/psa/kameraden ohne Anmeldung → 401", s.status === 401, `${s.status}`);
} finally {
  // Aufräumen nur über gemerkte IDs und exakte Namen
  try {
    if (namen.length) await owner`delete from core.login_attempts where benutzername in ${owner(namen.map((n) => n.toLowerCase()))}`;
    if (ids.zuteilung.length) await owner`delete from fw_funk.device_assignments where id in ${owner(ids.zuteilung)}`;
    if (ids.geraet.length) await owner`delete from fw_funk.devices where id in ${owner(ids.geraet)}`;
    if (ids.stueck.length) await owner`delete from psa.ausruestungstuecke where id in ${owner(ids.stueck)}`;
    if (ids.typ.length) await owner`delete from psa.ausruestungstypen where id in ${owner(ids.typ)}`;
    if (ids.kam.length) await owner`delete from fw_food.mobile_tokens where kamerad_id in ${owner(ids.kam)}`;
    if (namen.length) await owner`delete from psa.changelog where benutzer in ${owner(namen)}`;
    if (ids.kam.length) await owner`delete from core.mitglieder_audit where kamerad_id in ${owner(ids.kam)}`;
    if (ids.kam.length) await owner`delete from core.benutzer where kamerad_id in ${owner(ids.kam)}`;
    if (ids.kam.length) await owner`delete from core.kameraden where id in ${owner(ids.kam)}`;
    const [{ n }] = await owner`select count(*)::int n from core.kameraden where name like ${stamp + "-%"}`;
    console.log(`Aufräumen: ${ids.kam.length} Kameraden samt Zugängen und Protokoll; Rest mit Zeitstempel ${stamp}: ${n}`);
  } catch (e) { console.log("AUFRÄUMEN FEHLGESCHLAGEN:", e.message, JSON.stringify({ ids, namen })); fail++; }
  await owner.end({ timeout: 5 });
}
console.log(fail === 0 ? "\nALLE TESTS OK" : `\n${fail} TEST(S) FEHLGESCHLAGEN`);
process.exit(fail ? 1 : 0);
