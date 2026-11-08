// Rechtetest Härtung core.kameraden / core.benutzer (Migrationen 0012/0013).
//
// Aufruf:  node scripts/test-haertung.mjs
// Env (aus .env.local, falls vorhanden):
//   DATABASE_URL          fw_app (NOBYPASSRLS): Hier laufen die Tests
//   MIGRATE_DATABASE_URL  Owner: nur Testdaten anlegen, kontrollieren, aufräumen
//   TEST_DB               optional: anderer Datenbankname für BEIDE Verbindungen
//                         (z. B. ein Klon mit anderem Eigentümer der Funktionen)
// Jeder Test läuft in einer Transaktion, die zurückgerollt wird. Testdaten
// (Kameraden, Benutzer, ein Ausrüstungsstück) entstehen über den Owner mit einem
// Zeitstempel-Präfix und werden ausschließlich über gemerkte IDs wieder gelöscht.
// Der Test bricht ab, wenn die Datenbank nicht lokal ist oder die Verbindung
// nicht fw_app ohne Superuser/BYPASSRLS ist (sonst wäre er für RLS wertlos).
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const P = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ENV = `${P}/.env.local`;
if (existsSync(ENV)) process.loadEnvFile(ENV);
const req = createRequire(`${P}/package.json`);
const postgres = (await import(pathToFileURL(req.resolve("postgres")).href)).default;
const ziel = (u) => { if (!process.env.TEST_DB) return u; const x = new URL(u); x.pathname = `/${process.env.TEST_DB}`; return x.toString(); };

// Schutz: legt Testdaten an. Nur gegen lokale Datenbanken.
const lokal = (h) => ["localhost", "127.0.0.1", "[::1]", "::1"].includes(h);
for (const name of ["DATABASE_URL", "MIGRATE_DATABASE_URL"]) {
  if (!process.env[name]) { console.error(`Abbruch: ${name} ist nicht gesetzt.`); process.exit(2); }
  if (!lokal(new URL(process.env[name]).hostname)) { console.error(`Abbruch: ${name} zeigt nicht auf eine lokale Datenbank.`); process.exit(2); }
}
const app = postgres(ziel(process.env.DATABASE_URL), { max: 2, onnotice: () => {} });
const owner = postgres(ziel(process.env.MIGRATE_DATABASE_URL), { max: 2, onnotice: () => {} });

const stamp = `hrt${Date.now().toString(36)}`;
let fail = 0, ok = 0;
const check = (name, cond, extra = "") => {
  if (cond) { ok++; console.log(`OK   ${name}${extra ? " — " + extra : ""}`); }
  else { fail++; console.log(`FEHLER ${name}${extra ? " — " + extra : ""}`); }
};
class Rollback extends Error {}

// Läuft als fw_app in einer Transaktion mit den GUCs; Rückgabe von fn, danach IMMER Rollback.
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
// Erwartet einen SQL-Fehler mit bestimmtem SQLSTATE (Savepoint, damit die Transaktion lebt).
async function fehler(tx, code, fn) {
  try { await tx.savepoint(async (sp) => { await fn(sp); }); }
  catch (e) { return e.code === code ? { ok: true } : { ok: false, got: e.code || e.message }; }
  return { ok: false, got: "kein Fehler" };
}

const ids = { kam: [], ben: [], stueck: [], typ: [] };
const mkKam = async (suffix, psa) => {
  const [k] = await owner`insert into core.kameraden (name, vorname, aktiv, psa_rolle) values (${`${stamp}-${suffix}`}, 'Hrt', true, ${psa}) returning id`;
  ids.kam.push(k.id); return k.id;
};
const mkBen = async (kid, name, rolle = "User") => {
  const [b] = await owner`insert into core.benutzer (benutzername, pin, rolle, kamerad_id, aktiv) values (${`${stamp}-${name}`}, 'x', ${rolle}, ${kid}, true) returning id`;
  ids.ben.push(b.id); return b.id;
};

try {
  const [who] = await app`select current_user as u, (select rolsuper or rolbypassrls from pg_roles where rolname = current_user) as bypass`;
  check("Verbindung ist fw_app ohne Superuser/BYPASSRLS", who.u === "fw_app" && who.bypass === false, who.u);
  if (who.u !== "fw_app" || who.bypass) throw new Error("Abbruch: falsche Rolle");

  // Testdaten (Owner)
  const KW = await mkKam("kw", "Kleiderwart"), kwB = await mkBen(KW, "kw");
  const USR = await mkKam("usr", "User"), usrB = await mkBen(USR, "usr");
  const ZIEL = await mkKam("ziel", "User"), zielB = await mkBen(ZIEL, "ziel");
  const ADM = await mkKam("adm", null), admB = await mkBen(ADM, "adm", "Admin");
  const FREI = await mkKam("frei", null); // ohne Account
  // Eigenes Ausrüstungsstück (Träger: USR) für die PSA-Abgrenzung; Typ wiederverwenden oder selbst anlegen.
  let [typ] = await owner`select id from psa.ausruestungstypen order by id limit 1`;
  if (!typ) { [typ] = await owner`insert into psa.ausruestungstypen (bezeichnung) values (${stamp + "-typ"}) returning id`; ids.typ.push(typ.id); }
  const [st] = await owner`insert into psa.ausruestungstuecke (ausruestungstyp_id, seriennummer, status, kamerad_id) values (${typ.id}, ${stamp + "-sn"}, 'Ausgegeben', ${USR}) returning id`;
  ids.stueck.push(st.id);
  const STUECK = st.id;
  const kwG = { "app.kamerad_id": KW, "app.psa_rolle": "Kleiderwart" };
  const usrG = { "app.kamerad_id": USR, "app.psa_rolle": "User" };
  const admG = { "app.kamerad_id": ADM, "app.app_rolle": "Admin" };
  const tvVon = async (tx, id) => (await tx`select token_version tv, aktiv from core.benutzer where id = ${id}`)[0];

  // ── 1. Kleiderwart deaktiviert Kamerad -> Benutzer deaktiviert, token_version + 1
  await als(kwG, async (tx) => {
    const vorher = await tvVon(tx, zielB); // Kleiderwart sieht fremde Benutzer nicht mehr -> undefined
    check("Kleiderwart sieht fremde core.benutzer nicht (benutzer_select)", vorher === undefined);
  });
  const tv0 = (await owner`select token_version tv from core.benutzer where id = ${zielB}`)[0].tv;
  await als(kwG, async (tx) => {
    const r = await tx`update core.kameraden set aktiv = false, updated_at = now() where id = ${ZIEL} returning id`;
    check("1 Kleiderwart deaktiviert Kamerad (UPDATE aktiv)", r.length === 1);
    await tx`select set_config('app.app_rolle','Admin',true)`; // nur zum Lesen im Test
    const z = await tvVon(tx, zielB);
    check("1 Benutzer des Kameraden deaktiviert", z.aktiv === false);
    check("1 token_version um 1 erhöht", z.tv === tv0 + 1, `${tv0} -> ${z.tv}`);
  });
  const nach = (await owner`select aktiv, token_version tv from core.benutzer where id = ${zielB}`)[0];
  check("1 Rollback wirksam (Testdaten unverändert)", nach.aktiv === true && nach.tv === tv0);

  await als(kwG, async (tx) => {
    const e = await fehler(tx, "FW001", (sp) => sp`update core.kameraden set aktiv = false where id = ${KW}`);
    check("1b Kleiderwart kann eigenen Kameraden nicht deaktivieren (FW001)", e.ok, e.got);
    const r = await tx`update core.kameraden set aktiv = false where id = ${FREI} returning id`;
    check("1c Kamerad ohne Account deaktivieren geht", r.length === 1);
    const r2 = await tx`update core.kameraden set aktiv = false where id = ${FREI} returning id`;
    check("1d erneutes Deaktivieren (bereits inaktiv) ist wirkungslos", r2.length === 1);
  });

  // 1e/1f Admin-Konto-Schutz: in Owner-Tx alle anderen Admins sperren, dann als fw_app versuchen.
  try {
    await owner.begin(async (tx) => {
      await tx`update core.benutzer set aktiv = false where rolle = 'Admin' and id <> ${admB}`;
      await tx`set local role fw_app`;
      await tx`select set_config('app.kamerad_id', ${String(KW)}, true)`;
      await tx`select set_config('app.psa_rolle', 'Kleiderwart', true)`;
      const e = await fehler(tx, "FW001", (sp) => sp`update core.kameraden set aktiv = false where id = ${ADM}`);
      check("1e letzter aktiver Admin kann nicht per Kamerad-Deaktivierung wegfallen (FW001)", e.ok, e.got);
      throw new Rollback();
    });
  } catch (e) { if (!(e instanceof Rollback)) throw e; }
  await als(kwG, async (tx) => {
    const r = await tx`update core.kameraden set aktiv = false where id = ${ADM} returning id`;
    check("1f Mit weiterem aktiven Admin ist Deaktivierung erlaubt", r.length === 1);
  });
  const realAdmins = (await owner`select count(*)::int n from core.benutzer where rolle='Admin' and aktiv and id <> ${admB}`)[0].n;
  check("1g reale Admin-Konten unverändert aktiv", realAdmins >= 1, `${realAdmins} weitere aktive Admins`);

  // ── 2. Normaler User
  await als(usrG, async (tx) => {
    let e = await fehler(tx, "42501", (sp) => sp`update core.kameraden set psa_rolle = 'Admin' where id = ${USR}`);
    check("2 User ändert eigene psa_rolle per SQL -> abgelehnt (42501)", e.ok, e.got);
    for (const col of ["food_rolle", "fk_rolle", "funk_rolle"]) {
      e = await fehler(tx, "42501", (sp) => sp.unsafe(`update core.kameraden set ${col} = 'Admin' where id = ${USR}`));
      check(`2 User ändert eigene ${col} per SQL -> abgelehnt`, e.ok, e.got);
    }
    const r = await tx`update core.kameraden set name = 'x' where id = ${USR} returning id`;
    check("2 User schreibt eigene Stammdaten nicht (0 Zeilen, RLS)", r.length === 0);
    e = await fehler(tx, "42501", (sp) => sp`update core.kameraden set karten_id = 'k1' where id = ${USR}`);
    check("2 User ändert karten_id direkt -> abgelehnt", e.ok, e.got);
    e = await fehler(tx, "42501", (sp) => sp`insert into core.kameraden (name, vorname) values ('a','b')`);
    check("2 User legt Kamerad an -> abgelehnt", e.ok, e.got);
    e = await fehler(tx, "42501", (sp) => sp`delete from core.kameraden where id = ${USR}`);
    check("2 User löscht Kamerad -> abgelehnt", e.ok, e.got);
    const sicht = await tx`select id from core.kameraden`;
    check("2 User sieht nur die eigene Kameradenzeile", sicht.length === 1 && sicht[0].id === USR, `${sicht.length} Zeile(n)`);
    const rb = await tx`update core.benutzer set rolle = 'Admin' where kamerad_id = ${USR} returning id`;
    check("2 User ändert eigene Benutzer-rolle -> 0 Zeilen", rb.length === 0);
    const rp = await tx`update core.benutzer set pin = 'neu' where kamerad_id = ${USR} returning id`;
    check("2 User schreibt core.benutzer nicht direkt (PIN) -> 0 Zeilen", rp.length === 0);
    const e2 = await fehler(tx, "42501", (sp) => sp`select core.set_kamerad_rollen(${USR}::integer, '{"psa_rolle":"Admin"}'::jsonb)`);
    check("2 User ruft set_kamerad_rollen -> abgelehnt", e2.ok, e2.got);
    // Eigene PIN/Sitzung über die Funktionen
    const p = await tx`select * from core.eigene_pin_setzen(${usrB}::integer, 'neuer-hash')`;
    check("2 eigene_pin_setzen auf eigenes Konto liefert Zeile mit token_version+1", p.length === 1 && p[0].kamerad_id === USR, JSON.stringify({ tv: p[0]?.token_version }));
    const pf = await tx`select * from core.eigene_pin_setzen(${zielB}::integer, 'fremd')`;
    check("2 eigene_pin_setzen auf FREMDES Konto -> 0 Zeilen", pf.length === 0);
    const app_rolle = (await tx`select current_setting('app.app_rolle', true) v`)[0].v;
    check("2 app.app_rolle nach Funktionsaufruf wiederhergestellt (nicht Admin)", app_rolle !== "Admin", JSON.stringify(app_rolle));
    const rb2 = await tx`update core.benutzer set rolle = 'Admin' where kamerad_id = ${USR} returning id`;
    check("2 danach weiterhin kein Schreibrecht auf core.benutzer", rb2.length === 0);
    const s1 = (await tx`select core.eigene_sitzungen_beenden(${usrB}::integer) n`)[0].n;
    const s2 = (await tx`select core.eigene_sitzungen_beenden(${zielB}::integer) n`)[0].n;
    check("2 eigene_sitzungen_beenden: eigenes Konto 1, fremdes 0", s1 === 1 && s2 === 0, `${s1}/${s2}`);
    const own = await tx`select id from core.benutzer`;
    check("2 User sieht nur das eigene core.benutzer", own.length === 1 && own[0].id === usrB);
  });

  // ── 3. Kleiderwart: karten_id / Rollen / Stammdaten
  await als(kwG, async (tx) => {
    let e = await fehler(tx, "42501", (sp) => sp`update core.kameraden set karten_id = 'kw-direkt' where id = ${ZIEL}`);
    check("3 Kleiderwart ändert karten_id direkt -> abgelehnt (42501)", e.ok, e.got);
    e = await fehler(tx, "42501", (sp) => sp`insert into core.kameraden (name, vorname, karten_id) values ('a','b','kk')`);
    check("3 Kleiderwart legt Kamerad mit karten_id an -> abgelehnt", e.ok, e.got);
    e = await fehler(tx, "42501", (sp) => sp`update core.kameraden set psa_rolle = 'Admin' where id = ${ZIEL}`);
    check("3 Kleiderwart ändert psa_rolle per SQL -> abgelehnt", e.ok, e.got);
    e = await fehler(tx, "42501", (sp) => sp`select core.set_karten_id(${ZIEL}::integer, 'kw-fn')`);
    check("3 set_karten_id ohne food-Admin -> abgelehnt (42501)", e.ok, e.got);
    e = await fehler(tx, "42501", (sp) => sp`select core.set_kamerad_rollen(${ZIEL}::integer, '{"psa_rolle":"Admin"}'::jsonb)`);
    check("3 set_kamerad_rollen als Kleiderwart -> abgelehnt", e.ok, e.got);
    e = await fehler(tx, "42501", (sp) => sp`delete from core.kameraden where id = ${ZIEL}`);
    check("3 Kleiderwart löscht Kamerad -> abgelehnt", e.ok, e.got);
    const neu = await tx`insert into core.kameraden (name, vorname, dienstgrad, email, personalnummer, aktiv) values (${stamp + "-neu"}, 'Hrt', 'OFM', 'a@b.c', ${stamp}, true) returning id`;
    check("3 Kleiderwart legt Kamerad mit Stammdaten an (erlaubt)", neu.length === 1);
    const up = await tx`update core.kameraden set vorname = 'Neu', dienstgrad = 'HFM', updated_at = now() where id = ${ZIEL} returning id`;
    check("3 Kleiderwart ändert Stammdaten (erlaubt)", up.length === 1);
    const alle = await tx`select id from core.kameraden`;
    check("3 Kleiderwart sieht alle Kameraden", alle.length > 4, `${alle.length} Zeilen`);
    const bs = await tx`select id from core.benutzer`;
    check("3 Kleiderwart sieht von core.benutzer nur die eigene Zeile", bs.length === 1 && bs[0].id === kwB);
    await tx`select set_config('app.food_rolle','Admin',true)`;
    await tx`select core.set_karten_id(${ZIEL}::integer, ${"k-" + stamp})`;
    const kk = (await tx`select karten_id from core.kameraden where id = ${ZIEL}`)[0].karten_id;
    check("3 set_karten_id MIT food_rolle=Admin funktioniert", kk === "k-" + stamp);
  });

  // ── 3b. Küchen-Admin NUR mit food_rolle (ohne psa_rolle, ohne app_rolle): echter Einsatzfall von set_karten_id
  await als({ "app.kamerad_id": USR, "app.food_rolle": "Admin" }, async (tx) => {
    await tx`select core.set_karten_id(${ZIEL}::integer, ${"kf-" + stamp})`;
    const kk = (await tx`select karten_id from core.kameraden where id = ${ZIEL}`)[0].karten_id;
    check("3b Food-Admin (nur food_rolle) setzt karten_id über set_karten_id", kk === "kf-" + stamp);
    await tx`select core.set_karten_id(${ZIEL}::integer, '')`;
    const leer = (await tx`select karten_id from core.kameraden where id = ${ZIEL}`)[0].karten_id;
    check("3b leerer String entfernt die Karten-ID (NULL)", leer === null);
    const e = await fehler(tx, "P0002", (sp) => sp`select core.set_karten_id(2147483000::integer, 'x')`);
    check("3b unbekannter Kamerad -> P0002", e.ok, e.got);
    const e2 = await fehler(tx, "42501", (sp) => sp`update core.kameraden set karten_id = 'direkt' where id = ${ZIEL}`);
    check("3b Food-Admin ändert karten_id nicht direkt (42501)", e2.ok, e2.got);
    const rb = (await tx`select current_setting('app.app_rolle', true) v`)[0].v;
    check("3b app.app_rolle nach set_karten_id nicht gesetzt/wiederhergestellt", rb !== "Admin", JSON.stringify(rb));
  });
  await als({ "app.kamerad_id": USR, "app.food_rolle": "Admin" }, async (tx) => {
    await tx`select core.set_karten_id(${ZIEL}::integer, ${"dupl-" + stamp})`;
    const e = await fehler(tx, "23505", (sp) => sp`select core.set_karten_id(${KW}::integer, ${"dupl-" + stamp})`);
    check("3b doppelte Karten-ID -> 23505", e.ok, e.got);
  });

  // ── 4. Globaler Admin (nur app_rolle, ohne psa_rolle)
  await als(admG, async (tx) => {
    const n = (await tx`select core.set_kamerad_rollen(${ZIEL}::integer, '{"psa_rolle":"Kleiderwart","food_rolle":"Admin"}'::jsonb) n`)[0].n;
    const z = (await tx`select psa_rolle, food_rolle, fk_rolle from core.kameraden where id = ${ZIEL}`)[0];
    check("4 globaler Admin setzt Rollen über set_kamerad_rollen", z.psa_rolle === "Kleiderwart" && z.food_rolle === "Admin", JSON.stringify(z));
    check("4 Funktion meldet 1 betroffenen Benutzer", n === 1, String(n));
    const tvz = (await tx`select token_version tv from core.benutzer where id = ${zielB}`)[0].tv;
    check("4 token_version des Benutzers erhöht", tvz === tv0 + 1, `${tv0} -> ${tvz}`);
    await tx`select core.set_kamerad_rollen(${ZIEL}::integer, '{"psa_rolle":null,"food_rolle":""}'::jsonb)`;
    const z2 = (await tx`select psa_rolle, food_rolle from core.kameraden where id = ${ZIEL}`)[0];
    check("4 null/'' entfernt die Rolle", z2.psa_rolle === null && z2.food_rolle === null);
    let e = await fehler(tx, "22023", (sp) => sp`select core.set_kamerad_rollen(${ZIEL}::integer, '{"name":"x"}'::jsonb)`);
    check("4 unbekannter Schlüssel -> 22023", e.ok, e.got);
    e = await fehler(tx, "22023", (sp) => sp`select core.set_kamerad_rollen(${ZIEL}::integer, '{}'::jsonb)`);
    check("4 leeres Objekt -> 22023", e.ok, e.got);
    e = await fehler(tx, "P0002", (sp) => sp`select core.set_kamerad_rollen(2147483000::integer, '{"psa_rolle":"Admin"}'::jsonb)`);
    check("4 unbekannter Kamerad -> P0002", e.ok, e.got);
    e = await fehler(tx, "42501", (sp) => sp`update core.kameraden set psa_rolle = 'Admin' where id = ${ZIEL}`);
    check("4 auch der globale Admin schreibt Rollen nicht per direktem UPDATE (42501)", e.ok, e.got);
    e = await fehler(tx, "42501", (sp) => sp`update core.kameraden set karten_id = 'x' where id = ${ZIEL}`);
    check("4 globaler Admin ändert karten_id nicht direkt (42501)", e.ok, e.got);
    const alle = await tx`select id from core.kameraden`;
    check("4 globaler Admin sieht alle Kameraden ohne psa_rolle", alle.length > 4, `${alle.length}`);
    const bs = await tx`select id from core.benutzer`;
    check("4 globaler Admin sieht alle Benutzer", bs.length >= 4, `${bs.length}`);
    const ub = await tx`update core.benutzer set rolle = 'Admin', aktiv = true where id = ${zielB} returning id`;
    check("4 globaler Admin ändert Benutzer (rolle/aktiv)", ub.length === 1);
    const ib = await tx`insert into core.benutzer (benutzername, pin, rolle, kamerad_id) values (${stamp + "-fr"}, 'x', 'User', ${FREI}) returning id`;
    check("4 globaler Admin legt Benutzer an", ib.length === 1);
    const ik = await tx`insert into core.kameraden (name, vorname) values (${stamp + "-ik"}, 'x') returning id`;
    check("4 globaler Admin legt Kamerad an", ik.length === 1);
    e = await fehler(tx, "42501", (sp) => sp`delete from core.kameraden where id = ${ZIEL}`);
    check("4 globaler Admin löscht Kamerad nicht hart (42501)", e.ok, e.got);
    const sicht = async (g) => als(g, async (t) => (await t`select id from psa.ausruestungstuecke where id = ${STUECK}`).length);
    const stueckAdmin = (await tx`select id from psa.ausruestungstuecke where id = ${STUECK}`).length;
    check("4 globaler Admin ohne psa_rolle sieht das Ausrüstungsstück NICHT", stueckAdmin === 0, String(stueckAdmin));
    const upd = await tx`update psa.ausruestungstuecke set notizen = 'x' where id = ${STUECK} returning id`;
    check("4 globaler Admin ohne psa_rolle kann es nicht ändern (0 Zeilen)", upd.length === 0);
    const del = await tx`delete from psa.ausruestungstuecke where id = ${STUECK} returning id`;
    check("4 globaler Admin ohne psa_rolle kann es nicht löschen (0 Zeilen)", del.length === 0);
    check("4 mit zusätzlichem psa_rolle=Admin (withGlobalAdminPsaScope) sichtbar", (await sicht({ ...admG, "app.psa_rolle": "Admin" })) === 1);
    check("4 Kleiderwart sieht das Stück", (await sicht(kwG)) === 1);
    check("4 Träger (User) sieht das eigene Stück", (await sicht(usrG)) === 1);
    check("4 anderer User (nicht Träger) sieht es nicht", (await sicht({ "app.kamerad_id": ZIEL, "app.psa_rolle": "User" })) === 0);
    check("4 Stück unverändert in der Datenbank", (await owner`select notizen from psa.ausruestungstuecke where id = ${STUECK}`)[0].notizen === null);
  });

  // ── 5. Ohne Scope und Lese-Policies anderer Module
  await als({}, async (tx) => {
    check("5 ohne Scope: keine Kameraden sichtbar", (await tx`select id from core.kameraden`).length === 0);
    check("5 ohne Scope: keine Benutzer sichtbar", (await tx`select id from core.benutzer`).length === 0);
    const e = await fehler(tx, "42501", (sp) => sp`select core.set_karten_id(${ZIEL}::integer, 'x')`);
    check("5 set_karten_id ohne Scope -> abgelehnt", e.ok, e.got);
  });
  await als({ "app.food_public": "true" }, async (tx) =>
    check("5 food_public liest Kameraden (Kiosk)", (await tx`select id from core.kameraden`).length > 4));
  await als({ "app.food_rolle": "Admin" }, async (tx) =>
    check("5 food-Admin liest Kameraden", (await tx`select id from core.kameraden`).length > 4));
  await als({ "app.funk_rolle": "Gerätewart" }, async (tx) =>
    check("5 Funk-Gerätewart liest Kameraden", (await tx`select id from core.kameraden`).length > 4));
} finally {
  // Aufräumen NUR über gemerkte IDs.
  try {
    if (ids.stueck.length) await owner`delete from psa.ausruestungstuecke where id in ${owner(ids.stueck)}`;
    if (ids.typ.length) await owner`delete from psa.ausruestungstypen where id in ${owner(ids.typ)}`;
    if (ids.ben.length) await owner`delete from core.benutzer where id in ${owner(ids.ben)}`;
    // über neu angelegte Kameraden (Test 3/4) sind zurückgerollt; nur die gemerkten löschen
    if (ids.kam.length) await owner`delete from core.kameraden where id in ${owner(ids.kam)}`;
    const rest = await owner`select count(*)::int n from core.kameraden where name like ${stamp + "%"}`;
    console.log(`Aufräumen: ${ids.stueck.length} Stück, ${ids.typ.length} Typ, ${ids.ben.length} Benutzer, ${ids.kam.length} Kameraden gelöscht; Rest mit Lauf-Zeitstempel ${stamp}: ${rest[0].n}`);
  } catch (e) { console.log("AUFRÄUMEN FEHLGESCHLAGEN:", e.message, JSON.stringify(ids)); fail++; }
  await app.end({ timeout: 5 }); await owner.end({ timeout: 5 });
}
console.log(`\n${ok} OK, ${fail} Fehler`);
process.exit(fail ? 1 : 0);
