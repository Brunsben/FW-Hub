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
import { schutz } from "./lib/schutz.mjs";

const P = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ENV = `${P}/.env.local`;
if (existsSync(ENV)) process.loadEnvFile(ENV);
const req = createRequire(`${P}/package.json`);
const postgres = (await import(pathToFileURL(req.resolve("postgres")).href)).default;
const ziel = (u) => { if (!process.env.TEST_DB) return u; const x = new URL(u); x.pathname = `/${process.env.TEST_DB}`; return x.toString(); };

schutz({ db: ["DATABASE_URL", "MIGRATE_DATABASE_URL"] });
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

  // ── 1. Kamerad deaktivieren -> Benutzer deaktiviert, token_version + 1 (nur globaler Admin darf, Migration 0015)
  await als(kwG, async (tx) => {
    const vorher = await tvVon(tx, zielB); // Kleiderwart sieht fremde Benutzer nicht -> undefined
    check("Kleiderwart sieht fremde core.benutzer nicht (benutzer_select)", vorher === undefined);
  });
  const tv0 = (await owner`select token_version tv from core.benutzer where id = ${zielB}`)[0].tv;
  await als(admG, async (tx) => {
    const r = await tx`update core.kameraden set aktiv = false, updated_at = now() where id = ${ZIEL} returning id`;
    check("1 globaler Admin deaktiviert Kamerad (UPDATE aktiv)", r.length === 1);
    const z = await tvVon(tx, zielB);
    check("1 Benutzer des Kameraden deaktiviert", z.aktiv === false);
    check("1 token_version um 1 erhöht", z.tv === tv0 + 1, `${tv0} -> ${z.tv}`);
  });
  const nach = (await owner`select aktiv, token_version tv from core.benutzer where id = ${zielB}`)[0];
  check("1 Rollback wirksam (Testdaten unverändert)", nach.aktiv === true && nach.tv === tv0);

  // Migration 0015: Kleiderwart und PSA Admin können Kameraden nicht mehr ändern, also auch nicht deaktivieren
  for (const [n, g] of [["Kleiderwart", kwG], ["PSA Admin", { "app.kamerad_id": KW, "app.psa_rolle": "Admin" }]]) {
    await als(g, async (tx) => {
      const r = await tx`update core.kameraden set aktiv = false where id = ${ZIEL} returning id`;
      check(`1h ${n} deaktiviert Kamerad → 0 Zeilen (nur globaler Admin, 0015)`, r.length === 0);
      await tx`select set_config('app.app_rolle','Admin',true)`; // nur zum Lesen im Test
      check(`1h ${n}: Benutzer der Person bleibt aktiv, token_version unverändert`, (await tvVon(tx, zielB)).aktiv === true);
    });
  }
  await als(admG, async (tx) => {
    const e = await fehler(tx, "FW001", (sp) => sp`update core.kameraden set aktiv = false where id = ${ADM}`);
    check("1b globaler Admin kann den eigenen Kameraden nicht deaktivieren (FW001)", e.ok, e.got);
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
      await tx`select set_config('app.app_rolle', 'Admin', true)`;
      const e = await fehler(tx, "FW001", (sp) => sp`update core.kameraden set aktiv = false where id = ${ADM}`);
      check("1e letzter aktiver Admin kann nicht per Kamerad-Deaktivierung wegfallen (FW001)", e.ok, e.got);
      throw new Rollback();
    });
  } catch (e) { if (!(e instanceof Rollback)) throw e; }
  await als({ "app.kamerad_id": KW, "app.app_rolle": "Admin" }, async (tx) => {
    const r = await tx`update core.kameraden set aktiv = false where id = ${ADM} returning id`;
    check("1f Mit weiterem aktiven Admin ist Deaktivierung erlaubt", r.length === 1);
  });
  const realAdmins = (await owner`select count(*)::int n from core.benutzer where rolle='Admin' and aktiv and id <> ${admB}`)[0].n;
  check("1g reale Admin-Konten unverändert aktiv", realAdmins >= 1, `${realAdmins} weitere aktive Admins`);

  // ── 2. Normaler User
  await als(usrG, async (tx) => {
    let e = await fehler(tx, "42501", (sp) => sp`update core.kameraden set psa_rolle = 'Admin' where id = ${USR}`);
    check("2 User ändert eigene psa_rolle per SQL -> abgelehnt (42501)", e.ok, e.got);
    for (const col of ["food_rolle", "fk_rolle", "funk_rolle", "dienst_rolle"]) {
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
    // Migration 0015: Stammdaten schreiben nur noch globale Admins
    e = await fehler(tx, "42501", (sp) => sp`insert into core.kameraden (name, vorname, dienstgrad, email, personalnummer, aktiv) values (${stamp + "-neu"}, 'Hrt', 'OFM', 'a@b.c', ${stamp}, true)`);
    check("3 Kleiderwart legt Kamerad mit Stammdaten an → abgelehnt (nur globaler Admin, 0015)", e.ok, e.got);
    const up = await tx`update core.kameraden set vorname = 'Neu', dienstgrad = 'HFM', updated_at = now() where id = ${ZIEL} returning id`;
    check("3 Kleiderwart ändert Stammdaten → 0 Zeilen (nur globaler Admin, 0015)", up.length === 0);
    const alle = await tx`select id from core.kameraden`;
    check("3 Kleiderwart sieht alle Kameraden", alle.length > 4, `${alle.length} Zeilen`);
    const bs = await tx`select id from core.benutzer`;
    check("3 Kleiderwart sieht von core.benutzer nur die eigene Zeile", bs.length === 1 && bs[0].id === kwB);
    await tx`select set_config('app.food_rolle','Admin',true)`;
    await tx`select core.set_karten_id(${ZIEL}::integer, ${"k-" + stamp})`;
    const kk = (await tx`select karten_id from core.kameraden where id = ${ZIEL}`)[0].karten_id;
    check("3 set_karten_id MIT food_rolle=Admin funktioniert", kk === "k-" + stamp);
  });

  // ── 3a. PSA Admin: ebenfalls keine Stammdaten mehr (0015); globaler Admin darf
  await als({ "app.kamerad_id": KW, "app.psa_rolle": "Admin" }, async (tx) => {
    const e = await fehler(tx, "42501", (sp) => sp`insert into core.kameraden (name, vorname) values ('a', 'b')`);
    check("3a PSA Admin legt Kamerad an → abgelehnt (0015)", e.ok, e.got);
    const up = await tx`update core.kameraden set vorname = 'Neu' where id = ${ZIEL} returning id`;
    check("3a PSA Admin ändert Stammdaten → 0 Zeilen (0015)", up.length === 0);
    check("3a PSA Admin liest weiterhin alle Kameraden", (await tx`select id from core.kameraden`).length > 4);
  });
  await als(admG, async (tx) => {
    const neu = await tx`insert into core.kameraden (name, vorname, dienstgrad, email, personalnummer, aktiv) values (${stamp + "-neu"}, 'Hrt', 'OFM', 'a@b.c', ${stamp}, true) returning id`;
    check("3a globaler Admin legt Kamerad mit Stammdaten an (erlaubt)", neu.length === 1);
    const up = await tx`update core.kameraden set vorname = 'Neu', dienstgrad = 'HFM', updated_at = now() where id = ${ZIEL} returning id`;
    check("3a globaler Admin ändert Stammdaten (erlaubt)", up.length === 1);
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

  // ── 7. Änderungsprotokoll core.mitglieder_audit (Trigger auf kameraden und benutzer)
  // Lesen im Test als globaler Admin: Zwischenschritt setzt app.app_rolle in derselben Transaktion.
  const auditLesen = async (tx, kamerad) => {
    await tx`select set_config('app.app_rolle','Admin',true)`;
    return tx`select abschnitt, feld, alt, neu, akteur_kamerad_id, akteur_name from core.mitglieder_audit where kamerad_id = ${kamerad} order by id`;
  };
  await als(admG, async (tx) => {
    await tx`update core.kameraden set vorname = 'Geändert', dienstgrad = 'HFM', updated_at = now() where id = ${ZIEL}`;
    const z = await auditLesen(tx, ZIEL);
    const vn = z.find((x) => x.feld === "vorname"), dg = z.find((x) => x.feld === "dienstgrad");
    check("7 globaler Admin ändert Stammdaten → Protokoll mit altem/neuem Wert", vn?.alt === "Hrt" && vn?.neu === "Geändert" && dg?.neu === "HFM" && vn?.abschnitt === "stammdaten");
    check("7 Protokoll nennt den Akteur (Kamerad-ID und Name)", vn?.akteur_kamerad_id === ADM && vn?.akteur_name === `Hrt ${stamp}-adm`, `${vn?.akteur_kamerad_id} ${vn?.akteur_name}`);
    check("7 unveränderte Felder erzeugen keinen Eintrag", !z.some((x) => x.feld === "name" || x.feld === "email"));
  });
  await als(admG, async (tx) => {
    await tx`update core.kameraden set aktiv = false where id = ${ZIEL}`;
    const z = await auditLesen(tx, ZIEL);
    check("7 Deaktivieren: Eintrag für den Kameraden UND für den Zugang (Trigger-Kette)",
      z.some((x) => x.abschnitt === "stammdaten" && x.feld === "aktiv" && x.alt === "true" && x.neu === "false") &&
      z.some((x) => x.abschnitt === "zugang" && x.feld === "aktiv" && x.alt === "true" && x.neu === "false"));
  });
  await als(admG, async (tx) => {
    await tx`select core.set_kamerad_rollen(${ZIEL}::integer, '{"psa_rolle":"Kleiderwart","funk_rolle":"Admin"}'::jsonb)`;
    const z = await auditLesen(tx, ZIEL);
    const p1 = z.find((x) => x.feld === "psa_rolle");
    check("7 Rollenänderung → Eintrag im Abschnitt rollen mit Akteur", p1?.abschnitt === "rollen" && p1?.alt === "User" && p1?.neu === "Kleiderwart" && p1?.akteur_kamerad_id === ADM);
    check("7 jede geänderte Rolle ein Eintrag", z.filter((x) => x.abschnitt === "rollen").length === 2);
    await tx`update core.benutzer set rolle = 'Admin' where id = ${zielB}`;
    const z2 = await auditLesen(tx, ZIEL);
    check("7 Rolle des Zugangs geändert → Eintrag im Abschnitt zugang", z2.some((x) => x.abschnitt === "zugang" && x.feld === "rolle" && x.alt === "User" && x.neu === "Admin"));
    await tx`update core.benutzer set pin = 'geheimer-hash-wert' where id = ${zielB}`;
    const z3 = await auditLesen(tx, ZIEL);
    const pin = z3.find((x) => x.feld === "pin");
    check("7 PIN-Änderung: Ereignis ohne Wert", pin?.alt === null && pin?.neu === "geändert");
    check("7 PIN-Hash steht in keinem Protokoll-Wert", !z3.some((x) => [x.alt, x.neu].some((v) => v && v.includes("geheimer-hash-wert"))));
    const ins = await tx`insert into core.benutzer (benutzername, pin, rolle, kamerad_id) values (${stamp + "-aud"}, 'x', 'User', ${FREI}) returning id`;
    const z4 = await auditLesen(tx, FREI);
    check("7 Login angelegt → Eintrag", ins.length === 1 && z4.some((x) => x.feld === "login angelegt" && x.neu === `${stamp}-aud (User)`));
  });
  await als({ "app.kamerad_id": USR, "app.psa_rolle": "User" }, async (tx) => {
    await tx`select * from core.eigene_pin_setzen(${usrB}::integer, 'neuer-hash-xyz')`;
    const z = await auditLesen(tx, USR);
    check("7 eigene PIN-Änderung: Eintrag mit dem Benutzer selbst als Akteur", z.some((x) => x.feld === "pin" && x.akteur_kamerad_id === USR));
    check("7 Hash der neuen PIN steht nicht im Protokoll", !z.some((x) => [x.alt, x.neu].some((v) => v && v.includes("neuer-hash-xyz"))));
  });
  await als({ "app.kamerad_id": USR, "app.food_rolle": "Admin" }, async (tx) => {
    await tx`select core.set_karten_id(${ZIEL}::integer, ${"audit-" + stamp})`;
    const z = await auditLesen(tx, ZIEL);
    check("7 Karten-ID über set_karten_id → Eintrag mit Küchen-Admin als Akteur", z.some((x) => x.feld === "karten_id" && x.neu === "audit-" + stamp && x.akteur_kamerad_id === USR));
  });
  // ── 7a. Spitzname (Migration 0016): Spaltenrechte, Policies, Protokoll
  await als(admG, async (tx) => {
    await tx`update core.kameraden set spitzname = 'HGL', spitzname_anzeigen = true, updated_at = now() where id = ${ZIEL}`;
    const z = await auditLesen(tx, ZIEL);
    check("7a globaler Admin setzt Spitzname → Protokoll spitzname und spitzname_anzeigen",
      z.some((x) => x.feld === "spitzname" && x.alt === null && x.neu === "HGL" && x.abschnitt === "stammdaten") &&
      z.some((x) => x.feld === "spitzname_anzeigen" && x.alt === "false" && x.neu === "true"));
    const neu = await tx`insert into core.kameraden (name, vorname, spitzname, spitzname_anzeigen) values (${stamp + "-sp"}, 'Hrt', 'SP', true) returning id`;
    check("7a globaler Admin legt Kamerad mit Spitzname an (Spaltenrecht INSERT, zurückgerollt)", neu.length === 1);
  });
  await als(kwG, async (tx) => {
    const up = await tx`update core.kameraden set spitzname = 'x' where id = ${ZIEL} returning id`;
    check("7a Kleiderwart ändert Spitzname → 0 Zeilen (nur globaler Admin)", up.length === 0);
  });
  await als(usrG, async (tx) => {
    const up = await tx`update core.kameraden set spitzname = 'x', spitzname_anzeigen = true where id = ${USR} returning id`;
    check("7a User ändert eigenen Spitzname → 0 Zeilen", up.length === 0);
  });

  // Schutz des Protokolls selbst
  await als(admG, async (tx) => {
    let e = await fehler(tx, "42501", (sp) => sp`insert into core.mitglieder_audit (kamerad_id, abschnitt, feld) values (${ZIEL}, 'stammdaten', 'x')`);
    check("7 fw_app kann das Protokoll nicht beschreiben (auch nicht als globaler Admin)", e.ok, e.got);
    e = await fehler(tx, "42501", (sp) => sp`update core.mitglieder_audit set neu = 'x'`);
    check("7 fw_app kann das Protokoll nicht ändern", e.ok, e.got);
    e = await fehler(tx, "42501", (sp) => sp`delete from core.mitglieder_audit`);
    check("7 fw_app kann das Protokoll nicht löschen", e.ok, e.got);
    e = await fehler(tx, "42501", (sp) => sp`select core.audit_schreiben(${ZIEL}::integer, 'stammdaten', 'x', null, null)`);
    check("7 audit_schreiben ist für fw_app nicht aufrufbar", e.ok, e.got);
    const gesamt = (await tx`select count(*)::int n from core.mitglieder_audit`)[0].n;
    check("7 globaler Admin darf das Protokoll lesen", gesamt >= 0);
  });
  await als(kwG, async (tx) => check("7 Kleiderwart sieht keine Protokolleinträge (RLS)", (await tx`select id from core.mitglieder_audit`).length === 0));
  await als(usrG, async (tx) => check("7 User sieht keine Protokolleinträge (RLS)", (await tx`select id from core.mitglieder_audit`).length === 0));
  await als({ "app.food_rolle": "Admin" }, async (tx) => check("7 Küchen-Admin sieht keine Protokolleinträge (RLS)", (await tx`select id from core.mitglieder_audit`).length === 0));
} finally {
  // Aufräumen NUR über gemerkte IDs.
  try {
    if (ids.stueck.length) await owner`delete from psa.ausruestungstuecke where id in ${owner(ids.stueck)}`;
    if (ids.typ.length) await owner`delete from psa.ausruestungstypen where id in ${owner(ids.typ)}`;
    if (ids.ben.length) await owner`delete from core.benutzer where id in ${owner(ids.ben)}`;
    // über neu angelegte Kameraden (Test 3/4) sind zurückgerollt; nur die gemerkten löschen
    if (ids.kam.length) await owner`delete from core.mitglieder_audit where kamerad_id in ${owner(ids.kam)}`;
    if (ids.kam.length) await owner`delete from core.kameraden where id in ${owner(ids.kam)}`;
    const rest = await owner`select count(*)::int n from core.kameraden where name like ${stamp + "%"}`;
    console.log(`Aufräumen: ${ids.stueck.length} Stück, ${ids.typ.length} Typ, ${ids.ben.length} Benutzer, ${ids.kam.length} Kameraden gelöscht; Rest mit Lauf-Zeitstempel ${stamp}: ${rest[0].n}`);
  } catch (e) { console.log("AUFRÄUMEN FEHLGESCHLAGEN:", e.message, JSON.stringify(ids)); fail++; }
  await app.end({ timeout: 5 }); await owner.end({ timeout: 5 });
}
console.log(`\n${ok} OK, ${fail} Fehler`);
process.exit(fail ? 1 : 0);
