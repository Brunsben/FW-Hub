// Küche und Funk-Lesezugriff: Heute-Seite, CSV-Import, Karten-ID-Route, CSV-Export, set_karten_id,
// Funk-Scope. Ersetzt die früheren Einmal-Tests Stufe 1b und food-heute.
//
// Aufruf:  node scripts/test-food.mjs
// Env (aus .env.local, falls vorhanden):
//   DATABASE_URL          fw_app: Datenbankprüfungen (Funktion, Funk-Scope, RLS)
//   MIGRATE_DATABASE_URL  Owner: Testkonten anlegen, kontrollieren, aufräumen
//   TEST_BASE             optional, Standard http://localhost:3100
// Voraussetzung: lokaler Dev-Server auf derselben Datenbank. Bricht ab, wenn heute schon ein
// Menü oder Gäste existieren (fremde Daten werden nie überschrieben). Aufräumen nur über
// gemerkte IDs. Bricht ab, wenn Datenbank oder Server nicht lokal sind.
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

const stamp = `fd${Date.now().toString(36)}`;
const PIN = "141414";
let fail = 0;
const check = (n, c, i = "") => { if (!c) fail++; console.log(`${c ? "OK  " : "FEHLER"} ${n}${i ? " — " + i : ""}`); };
const ids = { kam: [], ben: [], menu: null, gast: [], reg: [] }, namen = [];
const hash = await bcrypt.hash(PIN, 12);
let ip = 0;

async function konto(suffix, { food = null, funk = null, login = true, pn = null } = {}) {
  const name = `${stamp}-${suffix}`; namen.push(name);
  const [k] = await owner`insert into core.kameraden (name, vorname, aktiv, food_rolle, funk_rolle, personalnummer) values (${name}, ${suffix}, true, ${food}, ${funk}, ${pn}) returning id`;
  ids.kam.push(k.id);
  if (login) { const [b] = await owner`insert into core.benutzer (benutzername, pin, rolle, kamerad_id) values (${name}, ${hash}, 'User', ${k.id}) returning id`; ids.ben.push(b.id); }
  return { name, kamerad: k.id, pn, cookie: null };
}
async function anmelden(k) {
  const r = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json", "x-real-ip": `203.0.113.${++ip + 170}` }, body: JSON.stringify({ benutzername: k.name, pin: PIN }) });
  if (r.status !== 200) throw new Error(`Anmeldung ${k.name} → ${r.status}`);
  k.cookie = (r.headers.get("set-cookie") || "").split(";")[0];
}
async function call(m, pfad, k, body) {
  const r = await fetch(`${BASE}${pfad}`, { method: m, redirect: "manual", headers: { "x-real-ip": "198.51.100.77", ...(k?.cookie ? { cookie: k.cookie } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const buf = Buffer.from(await r.arrayBuffer()); const text = buf.toString("utf8"); let json = null; try { json = JSON.parse(text); } catch { /* HTML/CSV */ }
  return { status: r.status, json, text, buf, loc: r.headers.get("location") || "" };
}
const must = (r, was) => { if (![200, 201].includes(r.status)) throw new Error(`${was} → ${r.status} ${r.text.slice(0, 160)}`); return r.json; };
const [{ heute }] = await owner`select (now() at time zone 'utc')::date::text heute`;   // = today() der App (UTC)

try {
  const [who] = await app`select current_user u, (select rolsuper or rolbypassrls from pg_roles where rolname = current_user) bypass`;
  check("DB-Verbindung der Tests ist fw_app ohne Superuser/BYPASSRLS", who.u === "fw_app" && who.bypass === false, who.u);
  const [{ m, g }] = await owner`select (select count(*)::int from fw_food.menus where date = ${heute}) m, (select count(*)::int from fw_food.guests where date = ${heute}) g`;
  if (m || g) throw new Error("Heute existieren bereits Menü oder Gäste – Test abgebrochen, um fremde Daten nicht zu überschreiben");

  const F = await konto("F", { food: "Admin" });
  const M = await konto("M", { food: "Mitglied" });
  const G = await konto("G", { funk: "Gerätewart" });
  const A = await konto("A");                                               // ohne Rollen
  const X = await konto("X", { login: false, pn: `P${stamp}X` });
  const Y = await konto("Y", { login: false, pn: `P${stamp}Y` });
  const T1 = await konto("T1", { login: false, pn: `P${stamp}1` });
  const T2 = await konto("T2", { login: false, pn: `P${stamp}2` });
  for (const k of [F, M, G, A]) await anmelden(k);
  const K1 = `K1-${stamp}`, K2 = `K2-${stamp}`;

  // ── Karten-ID-Route (PUT /api/food/admin/users/[id]) ──
  let r = await call("PUT", `/api/food/admin/users/${T2.kamerad}`, F, { card_id: K1, name: "Hacked", psaRolle: "Admin" });
  let [row] = await owner`select karten_id, name, psa_rolle from core.kameraden where id = ${T2.kamerad}`;
  check("Food-Admin setzt die Karten-ID (200)", r.status === 200 && row.karten_id === K1, `${r.status}`);
  check("PUT ignoriert name und psaRolle im Body", row.name === T2.name && row.psa_rolle === null, `${row.name === T2.name ? "unverändert" : row.name} ${row.psa_rolle}`);
  r = await call("PUT", "/api/food/admin/users/99999999", F, { card_id: "X" });
  check("PUT auf unbekannte kamerad_id → 404", r.status === 404, `${r.status}`);
  r = await call("PUT", `/api/food/admin/users/${T2.kamerad}`, M, { card_id: "X" });
  check("PUT als Food-Mitglied → 403", r.status === 403, `${r.status}`);

  // ── set_karten_id in der Datenbank ──
  async function fn(foodRolle, id, karte) {
    try {
      await app.begin(async (tx) => {
        await tx`select set_config('app.kamerad_id', ${String(T2.kamerad)}, true)`;
        if (foodRolle !== null) await tx`select set_config('app.food_rolle', ${foodRolle}, true)`;
        await tx`select core.set_karten_id(${id}::integer, ${karte}::text)`;
      });
      return "ok";
    } catch (e) { return e.code; }
  }
  check("Funktion mit food_rolle Mitglied → 42501", (await fn("Mitglied", T2.kamerad, "Z")) === "42501");
  check("Funktion ohne food_rolle → 42501", (await fn(null, T2.kamerad, "Z")) === "42501");
  check("Funktion mit unbekannter id → P0002", (await fn("Admin", 99999999, "Z")) === "P0002");
  check("Funktion mit doppelter Karten-ID → 23505", (await fn("Admin", T1.kamerad, K1)) === "23505");
  {
    const [vor] = await owner`select name, vorname, psa_rolle, food_rolle, aktiv, personalnummer from core.kameraden where id = ${T2.kamerad}`;
    const e = await fn("Admin", T2.kamerad, "Name', psa_rolle = 'Admin");   // Injection-Versuch als Wert
    const [nach] = await owner`select name, vorname, psa_rolle, food_rolle, aktiv, personalnummer, karten_id from core.kameraden where id = ${T2.kamerad}`;
    const { karten_id: kid, ...rest } = nach;
    check("Funktion schreibt nur karten_id (Injection-Text landet als Wert)", e === "ok" && kid === "Name', psa_rolle = 'Admin" && JSON.stringify(rest) === JSON.stringify(vor));
    check("Leerstring wird NULL", (await fn("Admin", T2.kamerad, "")) === "ok" && (await owner`select karten_id from core.kameraden where id = ${T2.kamerad}`)[0].karten_id === null);
    const direkt = await app.begin(async (tx) => {
      await tx`select set_config('app.food_rolle', 'Admin', true)`;
      const n = (await tx`update core.kameraden set name = 'Hacked' where id = ${T2.kamerad}`).count;
      let spalte = null;
      try { await tx.savepoint(async (sp) => { await sp`update core.kameraden set psa_rolle = 'Admin' where id = ${T2.kamerad}`; }); } catch (e) { spalte = e.code; }
      return { n, spalte };
    });
    check("Direktes UPDATE im Food-Admin-Scope: name → 0 Zeilen (RLS), psa_rolle → 42501 (Spaltenrecht)", direkt.n === 0 && direkt.spalte === "42501", `${direkt.n}/${direkt.spalte}`);
  }
  await call("PUT", `/api/food/admin/users/${T2.kamerad}`, F, { card_id: K1 });   // T2 hält K1

  // ── CSV-Import ──
  r = await call("POST", "/api/food/admin/users/import", F, { csv: `T A;${T1.pn};${K2}` });
  check("CSV-Import, eine Zeile → 200, updated=1", r.status === 200 && r.json?.updated === 1 && (await owner`select karten_id from core.kameraden where id = ${T1.kamerad}`)[0].karten_id === K2, `${r.status}`);
  r = await call("POST", "/api/food/admin/users/import", F, { csv: `T A;${T1.pn};${K1}` });
  check("CSV-Import mit doppelter Karten-ID → 409, nichts übernommen", r.status === 409 && (await owner`select karten_id from core.kameraden where id = ${T1.kamerad}`)[0].karten_id === K2, `${r.status}`);
  r = await call("POST", "/api/food/admin/users/import", M, { csv: `x;${T1.pn};Q` });
  check("CSV-Import als Food-Mitglied → 403", r.status === 403, `${r.status}`);

  // ── Funk-Scope (Gerätewart liest, schreibt nicht) ──
  const gwRolle = "Ger" + "ä" + "tewart";
  const gw = await app.begin(async (tx) => {
    await tx`select set_config('app.kamerad_id', ${String(G.kamerad)}, true)`;
    await tx`select set_config('app.funk_rolle', ${gwRolle}, true)`;
    const [{ ok }] = await tx`select current_setting('app.funk_rolle', true) = any(array['Admin', 'Ger' || chr(228) || 'tewart']) ok`;
    const n = (await tx`select id from core.kameraden`).length;
    const upd = (await tx`update core.kameraden set vorname = 'x' where id = ${T1.kamerad}`).count;
    let ins = null, fnc = null;
    try { await tx.savepoint(async (sp) => { await sp`insert into core.kameraden (name, vorname) values ('a', 'b')`; }); } catch (e) { ins = e.code; }
    try { await tx.savepoint(async (sp) => { await sp`select core.set_karten_id(${T1.kamerad}::integer, 'Q')`; }); } catch (e) { fnc = e.code; }
    return { ok, n, upd, ins, fnc };
  });
  const [{ total }] = await owner`select count(*)::int total from core.kameraden`;
  check("Gerätewart-Wert (mit Umlaut) entspricht dem Policy-Literal", gw.ok === true);
  check("Gerätewart liest alle core.kameraden", gw.n === total, `${gw.n}/${total}`);
  check("Gerätewart: UPDATE → 0 Zeilen, INSERT → 42501, set_karten_id → 42501", gw.upd === 0 && gw.ins === "42501" && gw.fnc === "42501", `${gw.upd}/${gw.ins}/${gw.fnc}`);
  r = await call("GET", "/funk", G);
  check("/funk als Gerätewart: Seite lädt, Kameraden im Zuweisungsformular", r.status === 200 && r.text.includes(T1.name), `${r.status}`);
  const funkMit = await konto("FM", { funk: "Mitglied" }); await anmelden(funkMit);
  const eigene = await app.begin(async (tx) => {
    await tx`select set_config('app.kamerad_id', ${String(funkMit.kamerad)}, true)`;
    await tx`select set_config('app.funk_rolle', 'Mitglied', true)`;
    return (await tx`select id from core.kameraden`).map((x) => x.id);
  });
  check("Funk-Mitglied: nur die eigene Zeile in core.kameraden", eigene.length === 1 && eigene[0] === funkMit.kamerad);
  r = await call("GET", "/funk", funkMit);
  check("/funk als Funk-Mitglied lädt (Leseansicht)", r.status === 200 && r.text.includes("Meine Funkgeräte"), `${r.status}`);

  // ── Heute-Seite ──
  must(await call("POST", "/api/food/menu", F, { date: heute, description: `Testessen ${stamp}`, zwei_menues_aktiv: true, menu1_name: "Schnitzel", menu2_name: "Gemüsecurry", deadline_enabled: false }), "Menü");
  ids.menu = (await owner`select id from fw_food.menus where date = ${heute}`)[0].id;
  must(await call("POST", "/api/food/register", null, { personal_number: X.pn, menu_choice: 2 }), "Anmeldung X");
  must(await call("POST", "/api/food/register", null, { personal_number: Y.pn, menu_choice: 1 }), "Anmeldung Y");
  ids.reg = (await owner`select id from fw_food.registrations where date = ${heute} and kamerad_id in ${owner([X.kamerad, Y.kamerad])}`).map((x) => x.id);
  must(await call("POST", "/api/food/admin/guests", F, { date: heute, menu_choice: 1, count: 2 }), "Gäste 1");
  must(await call("POST", "/api/food/admin/guests", F, { date: heute, menu_choice: 2, count: 1 }), "Gäste 2");
  ids.gast = (await owner`select id from fw_food.guests where date = ${heute}`).map((x) => x.id);
  check("Setup: 2 Anmeldungen, Menü und 2 Gäste-Zeilen über die APIs angelegt", ids.reg.length === 2 && ids.menu && ids.gast.length === 2);

  let p = await call("GET", "/food/admin/heute", F);
  const nameX = `${stamp}-X, X`, nameY = `${stamp}-Y, Y`;
  const zahl = (attr) => (p.text.match(new RegExp(`${attr}[^>]*>(\\d+)`)) || [])[1];
  check("Food-Admin: /food/admin/heute → 200, beide Namen sichtbar", p.status === 200 && p.text.includes(nameX) && p.text.includes(nameY), `${p.status}`);
  check("Sortiert nach Name (X vor Y)", p.text.indexOf(nameX) < p.text.indexOf(nameY));
  check("Zähler: angemeldet 2, Gäste 3, gesamt 5", zahl("data-zaehler-angemeldet") === "2" && zahl("data-zaehler-gaeste") === "3" && zahl("data-zaehler-gesamt") === "5", `${zahl("data-zaehler-angemeldet")}/${zahl("data-zaehler-gaeste")}/${zahl("data-zaehler-gesamt")}`);
  check("Zwei-Menü-Modus: Menüwahl-Spalte, Menünamen, Zähler je Menü (3 / 2)", p.text.includes("Menüwahl") && p.text.includes("Schnitzel") && p.text.includes("Gemüsecurry") && zahl('data-zaehler-menue="1"') === "3" && zahl('data-zaehler-menue="2"') === "2");
  check("Kein PIN-Hash im HTML", !/\$2[aby]\$\d\d\$/.test(p.text));
  must(await call("POST", "/api/food/menu", F, { date: heute, description: `Testessen ${stamp}`, zwei_menues_aktiv: false, deadline_enabled: false }), "Menü einfach");
  p = await call("GET", "/food/admin/heute", F);
  check("Ein-Menü-Modus: Namen da, keine Menüwahl-Spalte, keine Menü-Zähler", p.status === 200 && p.text.includes(nameX) && !p.text.includes("Menüwahl") && !p.text.includes("data-zaehler-menue"));
  r = await call("GET", "/food/admin", F);
  check("/food/admin verlinkt /food/admin/heute", r.status === 200 && r.text.includes('href="/food/admin/heute"'));
  r = await call("GET", "/food/admin/heute", M);
  check("Food-Mitglied → 307 /food", r.status === 307 && r.loc.endsWith("/food"), `${r.status} ${r.loc}`);
  r = await call("GET", "/food/admin/heute");
  check("Ohne Cookie → 307 /login", r.status === 307 && r.loc.endsWith("/login"), `${r.status} ${r.loc}`);
  r = await call("GET", "/food/admin/heute", A);
  check("Ohne food_rolle → 307 /?kein_zugriff=food", r.status === 307 && r.loc.endsWith("/?kein_zugriff=food"), `${r.status} ${r.loc}`);
  const ohneScope = (await app`select count(*)::int n from fw_food.registrations where date = ${heute}`)[0].n;
  const mitScope = await app.begin(async (tx) => { await tx`select set_config('app.food_rolle', 'Admin', true)`; return (await tx`select count(*)::int n from fw_food.registrations where date = ${heute}`)[0].n; });
  check("RLS: fw_app ohne Scope sieht 0 Anmeldungen, im Food-Admin-Scope 2", ohneScope === 0 && mitScope === 2, `${ohneScope}/${mitScope}`);

  // ── CSV-Export ──
  r = await call("GET", "/api/food/stats/export", F);
  check("Export beginnt mit UTF-8-BOM (EF BB BF)", r.status === 200 && r.buf[0] === 0xef && r.buf[1] === 0xbb && r.buf[2] === 0xbf, `${r.status} ${r.buf.subarray(0, 3).toString("hex")}`);
  check("Export: 'Menüwahl' korrekt als UTF-8", r.text.includes("Menüwahl"));
  r = await call("GET", "/api/food/stats/export", M);
  check("Export als Food-Mitglied → 401 oder 403", [401, 403].includes(r.status), `${r.status}`);
} catch (e) {
  fail++; console.log("ABBRUCH:", e.message, String(e.stack || "").split(/\r?\n/).slice(1, 3).join(" | "));
} finally {
  try {
    if (ids.reg.length) await owner`delete from fw_food.registrations where id in ${owner(ids.reg)}`;
    if (ids.gast.length) await owner`delete from fw_food.guests where id in ${owner(ids.gast)}`;
    if (ids.menu) await owner`delete from fw_food.menus where id = ${ids.menu}`;
    if (ids.kam.length) await owner`delete from fw_food.registrations where kamerad_id in ${owner(ids.kam)}`;
    if (namen.length) await owner`delete from core.login_attempts where benutzername in ${owner(namen.map((n) => n.toLowerCase()))}`;
    if (ids.kam.length) await owner`delete from core.mitglieder_audit where kamerad_id in ${owner(ids.kam)}`;
    if (ids.kam.length) await owner`delete from core.benutzer where kamerad_id in ${owner(ids.kam)}`;
    if (ids.kam.length) await owner`delete from core.kameraden where id in ${owner(ids.kam)}`;
    const [{ n }] = await owner`select count(*)::int n from core.kameraden where name like ${stamp + "-%"}`;
    console.log(`Aufräumen: ${ids.kam.length} Kameraden, Menü, Gäste und Anmeldungen; Rest mit Zeitstempel ${stamp}: ${n}`);
  } catch (e) { console.log("AUFRÄUMEN FEHLGESCHLAGEN:", e.message, JSON.stringify({ ids, namen })); fail++; }
  await app.end({ timeout: 5 }); await owner.end({ timeout: 5 });
}
console.log(fail === 0 ? "\nALLE TESTS OK" : `\n${fail} TEST(S) FEHLGESCHLAGEN`);
process.exit(fail ? 1 : 0);
