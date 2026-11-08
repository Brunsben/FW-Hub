// PSA: Zeilensicherheit (RLS) auf allen PSA-Tabellen und die PSA-API je Rolle.
// Ersetzt die früheren Einmal-Tests 6b-1, 6b-2, Stufe 1c und den Löschteil von Stufe 2.
//
// Aufruf:  node scripts/test-psa.mjs
// Env (aus .env.local, falls vorhanden):
//   DATABASE_URL          fw_app (NOBYPASSRLS): Teil 1 läuft hier
//   MIGRATE_DATABASE_URL  Owner: Testdaten anlegen, kontrollieren, aufräumen
//   TEST_BASE             optional, Standard http://localhost:3100
// Teil 1 (Datenbank, kein Server): Policies, User sieht nur Eigenes und schreibt nie,
//   Kleiderwart/PSA Admin sehen und schreiben alles, globaler Admin ohne psa_rolle sieht
//   nichts, mit zusätzlicher psa_rolle (withGlobalAdminPsaScope) alles.
// Teil 2 (HTTP, lokaler Dev-Server auf derselben Datenbank): Kreislauf Stück, Ausgabe,
//   Rückgabe, Prüfung, Schaden; Schreibwege für User → 403; Admin ohne psa_rolle → 401;
//   Löschregeln für Ausrüstungsstücke; Nullzeilen-Abbruch (expectRows → 404).
//   Läuft der Server nicht, wird Teil 2 ausdrücklich übersprungen.
// Testdaten entstehen über den Owner mit Zeitstempel-Präfix und werden nur über gemerkte
// IDs gelöscht. Bricht ab, wenn Datenbank oder Server nicht lokal sind.
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
for (const name of ["DATABASE_URL", "MIGRATE_DATABASE_URL"]) {
  if (!process.env[name]) { console.error(`Abbruch: ${name} ist nicht gesetzt.`); process.exit(2); }
  if (!lokal(new URL(process.env[name]).hostname)) { console.error(`Abbruch: ${name} zeigt nicht auf eine lokale Datenbank.`); process.exit(2); }
}
if (!lokal(new URL(BASE).hostname)) { console.error("Abbruch: TEST_BASE ist nicht lokal."); process.exit(2); }
const app = postgres(process.env.DATABASE_URL, { max: 2, onnotice: () => {} });
const owner = postgres(process.env.MIGRATE_DATABASE_URL, { max: 2, onnotice: () => {} });

const stamp = `psa${Date.now().toString(36)}`;
const PIN = "131313";
let fail = 0;
const check = (n, c, i = "") => { if (!c) fail++; console.log(`${c ? "OK  " : "FEHLER"} ${n}${i ? " — " + i : ""}`); };
class Rollback extends Error {}
async function als(gucs, fn) {
  let result;
  try {
    await app.begin(async (tx) => {
      for (const [k, v] of Object.entries(gucs)) await tx`select set_config(${k}, ${String(v)}, true)`;
      result = await fn(tx);
      throw new Rollback();
    });
  } catch (e) { if (!(e instanceof Rollback)) throw e; }
  return result;
}
async function fehler(tx, code, fn) {
  try { await tx.savepoint(async (sp) => { await fn(sp); }); }
  catch (e) { return e.code === code ? { ok: true } : { ok: false, got: e.code || e.message }; }
  return { ok: false, got: "kein Fehler" };
}

const ids = { kam: [], ben: [], stueck: [], typ: [], details: [] }, namen = [];
const hash = await bcrypt.hash(PIN, 12);
async function konto(suffix, { psa = null, appRolle = "User" } = {}) {
  const name = `${stamp}-${suffix}`; namen.push(name);
  const [k] = await owner`insert into core.kameraden (name, vorname, aktiv, psa_rolle) values (${name}, 'Psa', true, ${psa}) returning id`;
  ids.kam.push(k.id);
  const [b] = await owner`insert into core.benutzer (benutzername, pin, rolle, kamerad_id) values (${name}, ${hash}, ${appRolle}, ${k.id}) returning id`;
  ids.ben.push(b.id);
  return { name, kamerad: k.id, cookie: null };
}

try {
  const [who] = await app`select current_user u, (select rolsuper or rolbypassrls from pg_roles where rolname = current_user) bypass`;
  check("Verbindung ist fw_app ohne Superuser/BYPASSRLS", who.u === "fw_app" && who.bypass === false, who.u);
  if (who.u !== "fw_app" || who.bypass) throw new Error("Abbruch: falsche Rolle");

  const kw = await konto("kw", { psa: "Kleiderwart" });
  const psaAdmin = await konto("padm", { psa: "Admin" });
  const u = await konto("u", { psa: "User" });
  const o = await konto("o", { psa: "User" });
  const gAdmin = await konto("gadm", { psa: "User", appRolle: "Admin" });  // globaler Admin MIT psa_rolle User
  const gOhne = await konto("gohne", { appRolle: "Admin" });                // globaler Admin OHNE psa_rolle
  const mitglied = await konto("ohne");                                     // keine psa_rolle

  let [typ] = await owner`select id from psa.ausruestungstypen order by id limit 1`;
  if (!typ) { [typ] = await owner`insert into psa.ausruestungstypen (bezeichnung) values (${stamp + "-typ"}) returning id`; ids.typ.push(typ.id); }
  const stueck = async (suffix, kam) => {
    const [s] = await owner`insert into psa.ausruestungstuecke (ausruestungstyp_id, seriennummer, status, kamerad_id) values (${typ.id}, ${`${stamp}-${suffix}`}, 'Ausgegeben', ${kam}) returning id`;
    ids.stueck.push(s.id); return s.id;
  };
  const SU = await stueck("su", u.kamerad), SO = await stueck("so", o.kamerad);
  // Historie je Stück (Löschen des Stücks kaskadiert), dazu Größen je Person
  for (const [s, k] of [[SU, u.kamerad], [SO, o.kamerad]]) {
    await owner`insert into psa.ausgaben (ausruestungstueck_id, kamerad_id, ausgabedatum) values (${s}, ${k}, '2026-01-01')`;
    await owner`insert into psa.pruefungen (ausruestungstueck_id, kamerad_id, datum, ergebnis) values (${s}, ${k}, '2026-02-01', 'bestanden')`;
    await owner`insert into psa.waesche (ausruestungstueck_id, kamerad_id, datum) values (${s}, ${k}, '2026-03-01')`;
    await owner`insert into psa.schadensdokumentation (ausruestungstueck_id, beschreibung, datum) values (${s}, ${`SD-${stamp}`}, '2026-04-01')`;
    const [d] = await owner`insert into psa.kamerad_details (kamerad_id, jacke_groesse) values (${k}, 'M') returning id`;
    ids.details.push(d.id);
  }
  const guc = (k, psa, app_ = null) => ({ "app.kamerad_id": k.kamerad, "app.psa_rolle": psa ?? "", ...(app_ ? { "app.app_rolle": app_ } : {}) });
  const uG = guc(u, "User"), kwG = guc(kw, "Kleiderwart"), paG = guc(psaAdmin, "Admin");
  const gOhneG = { "app.kamerad_id": gOhne.kamerad, "app.app_rolle": "Admin" };
  const gPsaG = { "app.kamerad_id": gOhne.kamerad, "app.app_rolle": "Admin", "app.psa_rolle": "Admin" };

  // Tabelle -> Zeilenfilter auf die Testdaten, Insert (als fremde Zeile O / eigene Zeile U), Update
  const T = {
    ausruestungstuecke: { f: (x) => x`select id from psa.ausruestungstuecke where id in (${SU}, ${SO})`,
      ins: (x, k) => x`insert into psa.ausruestungstuecke (ausruestungstyp_id, seriennummer, status, kamerad_id) values (${typ.id}, ${`${stamp}-neu`}, 'Ausgegeben', ${k})`,
      upd: (x, k) => x`update psa.ausruestungstuecke set notizen = 'x' where id in (${SU}, ${SO}) and kamerad_id = ${k} returning id`,
      del: (x, k) => x`delete from psa.ausruestungstuecke where id in (${SU}, ${SO}) and kamerad_id = ${k} returning id`, eigene: 1 },
    ausgaben: { f: (x) => x`select id from psa.ausgaben where ausruestungstueck_id in (${SU}, ${SO})`,
      ins: (x, k) => x`insert into psa.ausgaben (ausruestungstueck_id, kamerad_id) values (${SU}, ${k})`,
      upd: (x, k) => x`update psa.ausgaben set notizen = 'x' where ausruestungstueck_id in (${SU}, ${SO}) and kamerad_id = ${k} returning id`,
      del: (x, k) => x`delete from psa.ausgaben where ausruestungstueck_id in (${SU}, ${SO}) and kamerad_id = ${k} returning id` },
    pruefungen: { f: (x) => x`select id from psa.pruefungen where ausruestungstueck_id in (${SU}, ${SO})`,
      ins: (x, k) => x`insert into psa.pruefungen (ausruestungstueck_id, kamerad_id, datum, ergebnis) values (${SU}, ${k}, '2026-05-01', 'bestanden')`,
      upd: (x, k) => x`update psa.pruefungen set notizen = 'x' where ausruestungstueck_id in (${SU}, ${SO}) and kamerad_id = ${k} returning id`,
      del: (x, k) => x`delete from psa.pruefungen where ausruestungstueck_id in (${SU}, ${SO}) and kamerad_id = ${k} returning id` },
    waesche: { f: (x) => x`select id from psa.waesche where ausruestungstueck_id in (${SU}, ${SO})`,
      ins: (x, k) => x`insert into psa.waesche (ausruestungstueck_id, kamerad_id, datum) values (${SU}, ${k}, '2026-05-01')`,
      upd: (x, k) => x`update psa.waesche set notizen = 'x' where ausruestungstueck_id in (${SU}, ${SO}) and kamerad_id = ${k} returning id`,
      del: (x, k) => x`delete from psa.waesche where ausruestungstueck_id in (${SU}, ${SO}) and kamerad_id = ${k} returning id` },
    schadensdokumentation: { f: (x) => x`select id from psa.schadensdokumentation where ausruestungstueck_id in (${SU}, ${SO})`,
      ins: (x, k) => x`insert into psa.schadensdokumentation (ausruestungstueck_id, beschreibung) values (${k === u.kamerad ? SU : SO}, 'neu')`,
      upd: (x, k) => x`update psa.schadensdokumentation set beschreibung = 'x' where ausruestungstueck_id = ${k === u.kamerad ? SU : SO} returning id`,
      del: (x, k) => x`delete from psa.schadensdokumentation where ausruestungstueck_id = ${k === u.kamerad ? SU : SO} returning id` },
    kamerad_details: { f: (x) => x`select id from psa.kamerad_details where kamerad_id in (${u.kamerad}, ${o.kamerad})`,
      ins: (x, k) => x`insert into psa.kamerad_details (kamerad_id, jacke_groesse) values (${k}, 'L')`,
      upd: (x, k) => x`update psa.kamerad_details set jacke_groesse = 'XL' where kamerad_id = ${k} returning id`,
      del: (x, k) => x`delete from psa.kamerad_details where kamerad_id = ${k} returning id` },
  };

  // ── Teil 1: Datenbank ──
  const pol = await owner`select tablename, policyname from pg_policies where schemaname = 'psa' order by 1, 2`;
  check("Policies: je PSA-Tabelle <t>_priv und <t>_eigene_lesen (12)", pol.length === 12 && Object.keys(T).every((t) => pol.some((p) => p.tablename === t && p.policyname === `${t}_priv`) && pol.some((p) => p.tablename === t && p.policyname === `${t}_eigene_lesen`)), `${pol.length}`);
  const rls = await owner`select relname, relrowsecurity r, relforcerowsecurity f from pg_class where oid = any(${Object.keys(T).map((t) => `psa.${t}`)}::regclass[])`;
  check("RLS aktiv und erzwungen (FORCE) auf allen sechs Tabellen", rls.length === 6 && rls.every((r) => r.r && r.f), JSON.stringify(rls.filter((r) => !(r.r && r.f))));

  for (const [t, d] of Object.entries(T)) {
    await als(uG, async (tx) => {
      const sicht = await d.f(tx);
      check(`${t}: User sieht nur die eigene Zeile`, sicht.length === 1, `${sicht.length}`);
      let e = await fehler(tx, "42501", (sp) => d.ins(sp, o.kamerad));
      check(`${t}: User legt fremde Zeile nicht an (42501)`, e.ok, e.got);
      e = await fehler(tx, "42501", (sp) => d.ins(sp, u.kamerad));
      check(`${t}: User legt auch eigene Zeile nicht an (42501)`, e.ok, e.got);
      check(`${t}: User ändert eigene und fremde Zeile nicht (0 Zeilen)`, (await d.upd(tx, u.kamerad)).length === 0 && (await d.upd(tx, o.kamerad)).length === 0);
      check(`${t}: User löscht eigene und fremde Zeile nicht (0 Zeilen)`, (await d.del(tx, u.kamerad)).length === 0 && (await d.del(tx, o.kamerad)).length === 0);
    });
    for (const [n, g] of [["Kleiderwart", kwG], ["PSA Admin", paG]]) {
      await als(g, async (tx) => {
        check(`${t}: ${n} sieht beide Zeilen`, (await d.f(tx)).length === 2);
        check(`${t}: ${n} ändert fremde Zeile (1 Zeile)`, (await d.upd(tx, o.kamerad)).length === 1);
        const e = await fehler(tx, "00000", async (sp) => { await d.ins(sp, o.kamerad); throw Object.assign(new Error("ok"), { code: "00000" }); });
        check(`${t}: ${n} darf anlegen (kein RLS-Fehler; 23505 = Eindeutigkeit, also nach der RLS-Prüfung)`, e.ok || e.got === "23505", e.got);
      });
    }
    await als(gOhneG, async (tx) => check(`${t}: globaler Admin OHNE psa_rolle sieht nichts`, (await d.f(tx)).length === 0));
    await als(gPsaG, async (tx) => check(`${t}: globaler Admin mit zusätzlicher psa_rolle (withGlobalAdminPsaScope) sieht alles`, (await d.f(tx)).length === 2));
    await als({ "app.kamerad_id": mitglied.kamerad }, async (tx) => check(`${t}: ohne psa_rolle sieht niemand fremde Zeilen`, (await d.f(tx)).length === 0));
  }

  // ── Teil 2: HTTP ──
  let serverDa = false;
  try { serverDa = (await fetch(`${BASE}/login`)).status === 200; } catch { /* Server nicht erreichbar */ }
  if (!serverDa) {
    console.log("ÜBERSPRUNGEN: Teil 2 (HTTP), kein Dev-Server unter " + BASE);
  } else {
    let ip = 0;
    const anmelden = async (k) => {
      const r = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json", "x-real-ip": `203.0.113.${++ip + 140}` }, body: JSON.stringify({ benutzername: k.name, pin: PIN }) });
      if (r.status !== 200) throw new Error(`Anmeldung ${k.name} → ${r.status}`);
      k.cookie = (r.headers.get("set-cookie") || "").split(";")[0];
    };
    for (const k of [kw, psaAdmin, u, o, gAdmin, gOhne, mitglied]) await anmelden(k);
    const api = async (m, pfad, k, body) => {
      const r = await fetch(`${BASE}${pfad}`, { method: m, redirect: "manual", headers: { ...(k ? { cookie: k.cookie } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      const t = await r.text(); let json = null; try { json = JSON.parse(t); } catch { /* HTML */ }
      return { status: r.status, json, loc: r.headers.get("location") };
    };
    const FOTO = "data:image/png;base64,iVBORw0KGgo=";

    // Kreislauf als Kleiderwart
    let s = await api("POST", "/api/psa/ausruestungstuecke", kw, { ausruestungstypId: typ.id, seriennummer: `${stamp}-zyklus`, status: "Lager" });
    const ZS = s.json?.stueck?.id; if (ZS) ids.stueck.push(ZS);
    check("Kleiderwart legt ein Stück an → 201", s.status === 201 && ZS, `${s.status}`);
    s = await api("POST", "/api/psa/ausgaben", kw, { ausruestungstueckId: ZS, kameradId: u.kamerad });
    const stZ = async () => (await owner`select status, kamerad_id, naechste_pruefung from psa.ausruestungstuecke where id = ${ZS}`)[0];
    check("Ausgabe an User → 201, Träger User, Status Ausgegeben", s.status === 201 && (await stZ()).kamerad_id === u.kamerad && (await stZ()).status === "Ausgegeben", `${s.status}`);
    const aid = s.json?.ausgabe?.id;
    s = await api("GET", `/api/psa/ausgaben?ausruestungstueckId=${ZS}`, kw);
    check("GET Ausgaben ?ausruestungstueckId= liefert die offene Ausgabe", s.status === 200 && JSON.stringify(s.json).includes(`"id":${aid}`), `${s.status}`);
    s = await api("PATCH", "/api/psa/ausgaben", kw, { id: aid });
    check("Rückgabe → 200, Stück im Lager ohne Träger", s.status === 200 && (await stZ()).status === "Lager" && (await stZ()).kamerad_id === null, `${s.status}`);
    s = await api("POST", "/api/psa/pruefungen", kw, { ausruestungstueckId: ZS, datum: "2026-11-01", ergebnis: "bestanden" });
    check("Prüfung → 201, nächste Prüfung am Stück gesetzt (Datum + 12 Monate)", s.status === 201 && String((await stZ()).naechste_pruefung).includes("2027"), `${s.status} ${(await stZ()).naechste_pruefung}`);
    s = await api("POST", "/api/psa/schadensdokumentation", kw, { ausruestungstueckId: ZS, beschreibung: "Zyklus", foto: FOTO });
    check("Schaden erfassen → 201", s.status === 201, `${s.status}`);
    const [{ n: nCl }] = await owner`select count(*)::int n from psa.changelog where benutzer = ${kw.name}`;
    check("Changelog: Einträge für Anlegen, Ausgabe, Rückgabe, Prüfung und Schaden", nCl >= 5, `${nCl}`);
    const [{ bezeichnung }] = await owner`select bezeichnung from psa.ausruestungstypen where id = ${typ.id}`;
    const logs = await owner`select aktion, details from psa.changelog where benutzer = ${kw.name} order by id`;
    const von = (a) => logs.find((l) => l.aktion === a)?.details ?? "";
    check("Changelog: Texte nennen Typ und Kameradennamen statt Platzhalter (?)", logs.length >= 5 && logs.every((l) => !String(l.details).includes("?")) && von("Ausgegeben").includes(bezeichnung) && von("Ausgegeben").includes(u.name) && von("Zurückgegeben") === bezeichnung, JSON.stringify(logs.map((l) => l.details)));
    s = await api("POST", "/api/psa/ausgaben", psaAdmin, { ausruestungstueckId: ZS, kameradId: o.kamerad });
    check("PSA Admin darf ebenfalls ausgeben → 201", s.status === 201, `${s.status}`);

    // User: nur Eigenes lesen, nie schreiben
    s = await api("GET", "/api/psa/ausruestungstuecke", u);
    const sn = (j) => (j?.stuecke || []).map((x) => x.seriennummer).filter((x) => x?.startsWith(stamp));
    check("User sieht über die API nur das eigene Stück", s.status === 200 && JSON.stringify(sn(s.json)) === JSON.stringify([`${stamp}-su`]), JSON.stringify(sn(s.json)));
    s = await api("GET", `/api/psa/ausruestungstuecke?kameradId=${o.kamerad}`, u);
    check("User sieht auch mit fremdem kameradId-Filter nur Eigenes", JSON.stringify(sn(s.json)) === JSON.stringify([`${stamp}-su`]), JSON.stringify(sn(s.json)));
    for (const [pfad, liste] of [["ausgaben", "ausgaben"], ["pruefungen", "pruefungen"], ["waesche", "waesche"]]) {
      s = await api("GET", `/api/psa/${pfad}`, u);
      const eigene = (s.json?.[liste] || []).filter((x) => [SU, SO].includes(x.ausruestungstueckId));
      check(`User sieht über die API nur eigene ${pfad}`, s.status === 200 && eigene.length === 1 && eigene[0].ausruestungstueckId === SU, `${s.status} ${eigene.length}`);
    }
    s = await api("GET", "/api/psa/schadensdokumentation", u);
    const sch = (s.json?.schaeden || []).filter((x) => [SU, SO].includes(x.ausruestungstueckId));
    check("User sieht nur Schäden am eigenen Stück", s.status === 200 && sch.length === 1 && sch[0].ausruestungstueckId === SU, `${s.status} ${sch.length}`);
    s = await api("GET", "/api/psa/schadensdokumentation", kw);
    check("Kleiderwart sieht die Schäden beider Stücke", (s.json?.schaeden || []).filter((x) => [SU, SO].includes(x.ausruestungstueckId)).length === 2);
    const schreib = [
      ["POST", "/api/psa/ausgaben", { ausruestungstueckId: SU, kameradId: u.kamerad }],
      ["PATCH", "/api/psa/ausgaben", { id: 1 }],
      ["POST", "/api/psa/pruefungen", { ausruestungstueckId: SU, datum: "2026-11-01", ergebnis: "bestanden" }],
      ["POST", "/api/psa/waesche", { ausruestungstueckId: SU, datum: "2026-11-01" }],
      ["POST", "/api/psa/ausruestungstuecke", { ausruestungstypId: typ.id }],
      ["PATCH", "/api/psa/ausruestungstuecke", { id: SU, notizen: "x" }],
      ["POST", "/api/psa/schadensdokumentation", { ausruestungstueckId: SU, foto: FOTO }],
      ["PATCH", `/api/psa/groessen/${u.kamerad}`, { jackeGroesse: "x" }],
    ];
    const codes = [];
    for (const [m, p, b] of schreib) codes.push((await api(m, p, u, b)).status);
    check("User: alle PSA-Schreibwege → 403", codes.every((c) => c === 403), codes.join(","));
    check("User hat nichts verändert (Größe unverändert)", (await owner`select jacke_groesse g from psa.kamerad_details where kamerad_id = ${u.kamerad}`)[0].g === "M");

    // Admin ohne psa_rolle, Mitglied ohne Rolle
    for (const [n, k] of [["globaler Admin ohne psa_rolle", gOhne], ["Mitglied ohne psa_rolle", mitglied]]) {
      const c = [];
      for (const p of ["ausruestungstuecke", "schadensdokumentation", "kameraden"]) c.push((await api("GET", `/api/psa/${p}`, k)).status);
      check(`${n}: PSA-API → 401`, c.every((x) => x === 401), c.join(","));
      s = await api("GET", "/psa", k);
      check(`${n}: /psa → 307 auf /?kein_zugriff=psa`, s.status === 307 && (s.loc || "").includes("kein_zugriff=psa"), `${s.status} ${s.loc}`);
    }

    // Nullzeilen-Abbruch (expectRows): unbekanntes Stück → 404, nichts angelegt
    const [{ n: ausg0 }] = await owner`select count(*)::int n from psa.ausgaben`;
    s = await api("POST", "/api/psa/ausgaben", kw, { ausruestungstueckId: 2147483000, kameradId: u.kamerad });
    check("Ausgabe auf unbekanntes Stück → 404", s.status === 404, `${s.status}`);
    s = await api("POST", "/api/psa/pruefungen", kw, { ausruestungstueckId: 2147483000, datum: "2026-11-01", ergebnis: "bestanden" });
    check("Prüfung auf unbekanntes Stück → 404", s.status === 404, `${s.status}`);
    const [{ n: ausg1 }] = await owner`select count(*)::int n from psa.ausgaben`;
    check("Dabei entsteht keine Ausgabe", ausg0 === ausg1);

    // Löschen von Stücken (Invariante: Stücke mit Historie werden nie gelöscht)
    const neu = async (suffix) => { const [x] = await owner`insert into psa.ausruestungstuecke (ausruestungstyp_id, seriennummer, status) values (${typ.id}, ${`${stamp}-${suffix}`}, 'Lager') returning id`; ids.stueck.push(x.id); return x.id; };
    const hist = {
      "mit Ausgabe": (id) => owner`insert into psa.ausgaben (ausruestungstueck_id, kamerad_id) values (${id}, ${u.kamerad})`,
      "mit Prüfung": (id) => owner`insert into psa.pruefungen (ausruestungstueck_id, datum, ergebnis) values (${id}, '2026-01-01', 'bestanden')`,
      "mit Wäsche": (id) => owner`insert into psa.waesche (ausruestungstueck_id, datum) values (${id}, '2026-01-01')`,
      "mit Schaden": (id) => owner`insert into psa.schadensdokumentation (ausruestungstueck_id, beschreibung) values (${id}, 'x')`,
    };
    for (const [label, mk] of Object.entries(hist)) {
      const id = await neu(`h${label.length}${label.slice(-3)}`); await mk(id);
      s = await api("DELETE", `/api/psa/ausruestungstuecke?id=${id}`, gAdmin);
      const da = (await owner`select 1 from psa.ausruestungstuecke where id = ${id}`).length;
      check(`DELETE Stück ${label} als globaler Admin → 409 mit Hinweis auf Ausgesondert, Stück bleibt`, s.status === 409 && /Ausgesondert/.test(JSON.stringify(s.json)) && da === 1, `${s.status}`);
    }
    const frei = await neu("frei");
    for (const [n, k] of [["Kleiderwart", kw], ["PSA Admin ohne globale Admin-Rolle", psaAdmin], ["User", u]]) {
      s = await api("DELETE", `/api/psa/ausruestungstuecke?id=${frei}`, k);
      check(`DELETE als ${n} → 403`, s.status === 403, `${s.status}`);
    }
    s = await api("DELETE", `/api/psa/ausruestungstuecke?id=${frei}`, gAdmin);
    check("DELETE Stück ohne Historie als globaler Admin → 200, Stück weg", s.status === 200 && (await owner`select 1 from psa.ausruestungstuecke where id = ${frei}`).length === 0, `${s.status}`);
    s = await api("DELETE", "/api/psa/ausruestungstuecke?id=2147483000", gAdmin);
    check("DELETE unbekanntes Stück → 404", s.status === 404, `${s.status}`);
    const mitHist = await neu("aus"); await hist["mit Ausgabe"](mitHist);
    s = await api("PATCH", "/api/psa/ausruestungstuecke", kw, { id: mitHist, status: "Ausgesondert" });
    check("Alternative: Status Ausgesondert per PATCH ist möglich", s.status === 200 && (await owner`select status from psa.ausruestungstuecke where id = ${mitHist}`)[0].status === "Ausgesondert", `${s.status}`);
  }
} catch (e) {
  fail++; console.log("ABBRUCH:", e.message);
} finally {
  try {
    if (ids.stueck.length) await owner`delete from psa.ausruestungstuecke where id in ${owner(ids.stueck)}`;   // kaskadiert Historie
    if (ids.kam.length) await owner`delete from psa.kamerad_details where kamerad_id in ${owner(ids.kam)}`;
    if (namen.length) await owner`delete from psa.changelog where benutzer in ${owner(namen)}`;
    if (ids.typ.length) await owner`delete from psa.ausruestungstypen where id in ${owner(ids.typ)}`;
    if (namen.length) await owner`delete from core.login_attempts where benutzername in ${owner(namen.map((n) => n.toLowerCase()))}`;
    if (ids.kam.length) await owner`delete from core.mitglieder_audit where kamerad_id in ${owner(ids.kam)}`;
    if (ids.kam.length) await owner`delete from core.benutzer where kamerad_id in ${owner(ids.kam)}`;
    if (ids.kam.length) await owner`delete from core.kameraden where id in ${owner(ids.kam)}`;
    const [{ n }] = await owner`select count(*)::int n from core.kameraden where name like ${stamp + "-%"}`;
    console.log(`Aufräumen: ${ids.kam.length} Kameraden, ${ids.stueck.length} Stücke; Rest mit Zeitstempel ${stamp}: ${n}`);
  } catch (e) { console.log("AUFRÄUMEN FEHLGESCHLAGEN:", e.message, JSON.stringify({ ids, namen })); fail++; }
  await app.end({ timeout: 5 }); await owner.end({ timeout: 5 });
}
console.log(fail === 0 ? "\nALLE TESTS OK" : `\n${fail} TEST(S) FEHLGESCHLAGEN`);
process.exit(fail ? 1 : 0);
