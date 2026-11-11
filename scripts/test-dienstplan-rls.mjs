// Rechtetest Schema dienstplan (Migrationen 0017/0018): RLS je Rolle, Organisation,
// Trigger (Versionszählung, Freigabeschutz), Namensfunktion, Rolle dienst_rolle in core,
// Anzeige-Scope der Präsentation (Migration 0019).
//
// Aufruf:  node scripts/test-dienstplan-rls.mjs   (kein Server nötig)
// Env (aus .env.local, falls vorhanden):
//   DATABASE_URL          fw_app (NOBYPASSRLS): Hier laufen die Prüfungen
//   MIGRATE_DATABASE_URL  Owner: Testdaten anlegen und aufräumen. Der Owner muss
//                         RLS umgehen (lokal: Superuser postgres), weil er Zeilen
//                         einer zweiten Organisation anlegt.
// Jede Prüfung läuft als fw_app in einer Transaktion, die zurückgerollt wird.
// Testdaten (Kameraden, Pläne der Jahre 2096–2099, Organisation 2) legt der Owner
// mit Zeitstempel an; gelöscht wird nur über gemerkte IDs.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { schutz } from "./lib/schutz.mjs";

const P = resolve(fileURLToPath(new URL("..", import.meta.url)));
if (existsSync(`${P}/.env.local`)) process.loadEnvFile(`${P}/.env.local`);
const req = createRequire(`${P}/package.json`);
const postgres = (await import(pathToFileURL(req.resolve("postgres")).href)).default;

schutz({ db: ["DATABASE_URL", "MIGRATE_DATABASE_URL"] });
const app = postgres(process.env.DATABASE_URL, { max: 2, onnotice: () => {} });
const owner = postgres(process.env.MIGRATE_DATABASE_URL, { max: 2, onnotice: () => {} });

const stamp = `dp${Date.now().toString(36)}`;
let fail = 0, ok = 0;
const check = (name, cond, extra = "") => {
  if (cond) { ok++; console.log(`OK   ${name}${extra ? " — " + extra : ""}`); }
  else { fail++; console.log(`FEHLER ${name}${extra ? " — " + extra : ""}`); }
};
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

const ids = { kam: [], ben: [], plan: [], vorschlag: [], org2: false };
const mkKam = async (suffix, extra = {}) => {
  const [k] = await owner`insert into core.kameraden (name, vorname, aktiv, spitzname, spitzname_anzeigen)
    values (${`${stamp}-${suffix}`}, 'Dp', ${extra.aktiv ?? true}, ${extra.spitzname ?? null}, ${extra.spitzname_anzeigen ?? false}) returning id`;
  ids.kam.push(k.id); return k.id;
};

try {
  const [who] = await app`select current_user as u, (select rolsuper or rolbypassrls from pg_roles where rolname = current_user) as bypass`;
  check("Verbindung ist fw_app ohne Superuser/BYPASSRLS", who.u === "fw_app" && who.bypass === false, who.u);
  if (who.u !== "fw_app" || who.bypass !== false) throw new Error("falsche Verbindung, Abbruch");

  // ── Testdaten ──────────────────────────────────────────────────────────────
  const ADM = await mkKam("adm"), PLN = await mkKam("pln"), MIT = await mkKam("mit"), MIT2 = await mkKam("mit2");
  const INA = await mkKam("ina", { aktiv: false, spitzname: "Ina", spitzname_anzeigen: true });
  const [{ d: katD }] = await owner`select id d from dienstplan.kategorien where organisation_id = 1 and kuerzel = 'D'`;
  const [{ id: regel }] = await owner`select id from dienstplan.rhythmus_regeln where organisation_id = 1 and name = 'Dienstabende'`;
  const plan = async (org, jahr, status) => {
    const [p] = await owner`insert into dienstplan.plaene (organisation_id, jahr, status) values (${org}, ${jahr}, ${status}) returning id`;
    ids.plan.push(p.id); return p.id;
  };
  await owner`insert into dienstplan.organisationen (id, name) values (2, ${stamp + "-org2"}) on conflict (id) do nothing`;
  ids.org2 = true;
  const [{ id: katOrg2 }] = await owner`insert into dienstplan.kategorien (organisation_id, kuerzel, name, farbe) values (2, 'D', 'Org2', 'blue') returning id`;
  const ENTWURF = await plan(1, 2099, "entwurf"), FREI = await plan(1, 2098, "freigegeben"), ORG2 = await plan(2, 2099, "entwurf");
  const termin = async (planId, datum, kat = katD) =>
    (await owner`insert into dienstplan.termine (plan_id, datum, kategorie_id) values (${planId}, ${datum}, ${kat}) returning id`)[0].id;
  const tEntwurf = await termin(ENTWURF, "2099-01-06");
  const tFrei = await termin(FREI, "2098-01-06");
  await termin(ORG2, "2099-01-06", katOrg2);
  const [{ id: vorschlagPln }] = await owner`insert into dienstplan.themenvorschlaege (organisation_id, titel, vorgeschlagen_von) values (1, ${stamp + "-v-pln"}, ${PLN}) returning id`;
  ids.vorschlag.push(vorschlagPln);

  const G = (rolle, org = 1, kamerad = ADM) => ({ "app.kamerad_id": kamerad, "app.dienst_rolle": rolle, "app.dienst_org": org });
  const adm = G("Admin", 1, ADM), pln = G("Planer", 1, PLN), mit = G("Mitglied", 1, MIT);
  const anzahl = async (tx, tabelle, where = "true") => (await tx.unsafe(`select count(*)::int n from dienstplan.${tabelle} where ${where}`))[0].n;
  const planVersion = async (tx, id) => (await tx`select version from dienstplan.plaene where id = ${id}`)[0]?.version;

  // ── 0. Rechte ──────────────────────────────────────────────────────────────
  const [r] = await owner`select
      has_schema_privilege('fw_app', 'dienstplan', 'USAGE') usage,
      has_table_privilege('fw_app', 'dienstplan.organisationen', 'INSERT') org_ins,
      has_table_privilege('fw_app', 'dienstplan.plan_versionen', 'UPDATE') ver_upd,
      has_table_privilege('fw_app', 'dienstplan.plan_versionen', 'DELETE') ver_del,
      has_table_privilege('fw_app', 'dienstplan.export_laeufe', 'DELETE') exp_del,
      has_table_privilege('fw_app', 'dienstplan.erinnerungs_versand', 'INSERT') ver_ins,
      has_table_privilege('fw_app', 'dienstplan.termine', 'INSERT') termin_ins,
      has_column_privilege('fw_app', 'core.kameraden', 'dienst_rolle', 'UPDATE') rolle_upd,
      (select count(*)::int from pg_tables where schemaname = 'dienstplan' and not (rowsecurity)) ohne_rls,
      (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'dienstplan' and c.relkind = 'r' and not c.relforcerowsecurity) ohne_force`;
  check("0 fw_app hat USAGE auf Schema dienstplan", r.usage === true);
  check("0 fw_app schreibt organisationen nicht", r.org_ins === false);
  check("0 plan_versionen und export_laeufe sind unveränderlich (kein UPDATE/DELETE)", !r.ver_upd && !r.ver_del && !r.exp_del);
  check("0 erinnerungs_versand: kein INSERT für fw_app (Job, Release 2)", r.ver_ins === false);
  check("0 fw_app hat Tabellenrecht INSERT auf termine (RLS entscheidet)", r.termin_ins === true);
  check("0 fw_app hat kein UPDATE auf core.kameraden.dienst_rolle", r.rolle_upd === false);
  check("0 alle Tabellen in dienstplan mit ENABLE und FORCE RLS", r.ohne_rls === 0 && r.ohne_force === 0, `${r.ohne_rls}/${r.ohne_force}`);

  // ── 1. Ohne Scope ──────────────────────────────────────────────────────────
  await als({}, async (tx) => {
    const n = [await anzahl(tx, "kategorien"), await anzahl(tx, "plaene"), await anzahl(tx, "organisationen"), await anzahl(tx, "termine")];
    check("1 ohne Scope: keine Kategorien, Pläne, Organisationen, Termine", n.every((x) => x === 0), JSON.stringify(n));
    let e = await fehler(tx, "42501", (sp) => sp`insert into dienstplan.kategorien (organisation_id, kuerzel, name, farbe) values (1, 'X', 'x', 'blue')`);
    check("1 ohne Scope: Kategorie anlegen → 42501", e.ok, e.got);
    e = await fehler(tx, "42501", (sp) => sp`select * from dienstplan.kameraden_namen()`);
    check("1 ohne Scope: kameraden_namen() → 42501", e.ok, e.got);
  });
  await als(G("Chef"), async (tx) => {
    check("1 unbekannte Rolle sieht nichts", (await anzahl(tx, "kategorien")) === 0 && (await anzahl(tx, "plaene")) === 0);
  });
  await als({ "app.dienst_rolle": "Admin" }, async (tx) => {
    check("1 Admin ohne Organisation sieht nichts", (await anzahl(tx, "kategorien")) === 0 && (await anzahl(tx, "plaene")) === 0);
  });

  // ── 2. Mitglied ────────────────────────────────────────────────────────────
  await als(mit, async (tx) => {
    check("2 Mitglied liest die Kategorien der eigenen Organisation (7 Seeds)", (await anzahl(tx, "kategorien")) === 7);
    const orgs = await tx`select id from dienstplan.organisationen`;
    check("2 Mitglied sieht nur die eigene Organisation", orgs.length === 1 && orgs[0].id === 1);
    const plaene = (await tx`select id from dienstplan.plaene where jahr >= 2096`).map((x) => x.id);
    check("2 Mitglied sieht nur freigegebene Pläne", plaene.length === 1 && plaene[0] === FREI, JSON.stringify(plaene));
    const termine = (await tx`select id from dienstplan.termine where plan_id = any(${[ENTWURF, FREI, ORG2]})`).map((x) => x.id);
    check("2 Mitglied sieht nur Termine freigegebener Pläne", termine.length === 1 && termine[0] === tFrei && !termine.includes(tEntwurf));
    check("2 Mitglied sieht keine Rhythmusregeln, Ausgleich, Exportprofile, Erinnerungen",
      (await anzahl(tx, "rhythmus_regeln")) + (await anzahl(tx, "ausgleich_personen")) + (await anzahl(tx, "export_profile")) + (await anzahl(tx, "erinnerungs_einstellungen")) === 0);
    let e = await fehler(tx, "42501", (sp) => sp`insert into dienstplan.termine (plan_id, datum, kategorie_id) values (${FREI}, '2098-02-03', ${katD})`);
    check("2 Mitglied legt keinen Termin an (42501)", e.ok, e.got);
    const up = await tx`update dienstplan.termine set ort = 'x' where id = ${tFrei} returning id`;
    check("2 Mitglied ändert keinen Termin (0 Zeilen)", up.length === 0);
    const upPlan = await tx`update dienstplan.plaene set version = version + 1 where id = ${FREI} returning id`;
    check("2 Mitglied ändert keinen Plan (0 Zeilen)", upPlan.length === 0);
    e = await fehler(tx, "42501", (sp) => sp`insert into dienstplan.themen (organisation_id, titel) values (1, ${stamp + "-t"})`);
    check("2 Mitglied pflegt keine Themen (42501)", e.ok, e.got);
    // Vorschläge
    const v = await tx`insert into dienstplan.themenvorschlaege (organisation_id, titel, vorgeschlagen_von) values (1, ${stamp + "-v"}, ${MIT}) returning id`;
    check("2 Mitglied reicht eigenen Vorschlag ein", v.length === 1);
    e = await fehler(tx, "42501", (sp) => sp`insert into dienstplan.themenvorschlaege (organisation_id, titel, vorgeschlagen_von) values (1, 'x', ${MIT2})`);
    check("2 Vorschlag im Namen einer anderen Person → 42501", e.ok, e.got);
    e = await fehler(tx, "42501", (sp) => sp`insert into dienstplan.themenvorschlaege (organisation_id, titel, vorgeschlagen_von, status) values (1, 'x', ${MIT}, 'uebernommen')`);
    check("2 Vorschlag direkt als übernommen → 42501", e.ok, e.got);
    e = await fehler(tx, "42501", (sp) => sp`insert into dienstplan.themenvorschlaege (organisation_id, titel, vorgeschlagen_von) values (2, 'x', ${MIT})`);
    check("2 Vorschlag für fremde Organisation → 42501", e.ok, e.got);
    const sicht = (await tx`select titel from dienstplan.themenvorschlaege`).map((x) => x.titel);
    check("2 Mitglied sieht nur eigene Vorschläge", sicht.length === 1 && sicht[0] === stamp + "-v", JSON.stringify(sicht));
    const upV = await tx`update dienstplan.themenvorschlaege set status = 'uebernommen' returning id`;
    check("2 Mitglied ändert keinen Vorschlag (0 Zeilen)", upV.length === 0);
    // Namen
    const namen = await tx`select * from dienstplan.kameraden_namen()`;
    const spalten = namen.columns.map((c) => c.name);
    check("2 kameraden_namen(): nur Namensfelder und aktiv", JSON.stringify(spalten) === '["id","vorname","name","spitzname","spitzname_anzeigen","aktiv"]', JSON.stringify(spalten));
    const ina = namen.find((x) => x.id === INA);
    check("2 kameraden_namen(): auch Inaktive, mit Spitzname", ina && ina.aktiv === false && ina.spitzname === "Ina" && ina.spitzname_anzeigen === true);
    check("2 kameraden_namen(): alle Testpersonen enthalten", [ADM, PLN, MIT, MIT2, INA].every((id) => namen.some((x) => x.id === id)));
    const rolle = (await tx`select current_setting('app.app_rolle', true) v`)[0].v;
    check("2 app.app_rolle nach kameraden_namen() nicht Admin", rolle !== "Admin", JSON.stringify(rolle));
    const kam = await tx`select id from core.kameraden`;
    check("2 Mitglied liest core.kameraden weiterhin nur die eigene Zeile", kam.length === 1 && kam[0].id === MIT, `${kam.length} Zeilen`);
  });

  // ── 3. Planer ──────────────────────────────────────────────────────────────
  await als(pln, async (tx) => {
    const plaene = (await tx`select id from dienstplan.plaene where jahr >= 2096 order by id`).map((x) => x.id);
    check("3 Planer sieht Entwurf und freigegebenen Plan, nicht Organisation 2", JSON.stringify(plaene) === JSON.stringify([ENTWURF, FREI]), JSON.stringify(plaene));
    check("3 Planer liest Rhythmusregeln (3 Seeds)", (await anzahl(tx, "rhythmus_regeln")) === 3);
    const v0 = await planVersion(tx, ENTWURF);
    const [t] = await tx`insert into dienstplan.termine (plan_id, datum, kategorie_id) values (${ENTWURF}, '2099-01-20', ${katD}) returning id`;
    const v1 = await planVersion(tx, ENTWURF);
    check("3 Planer legt Termin im Entwurf an, Version +1", t && v1 === v0 + 1, `${v0} -> ${v1}`);
    const [tt] = await tx`insert into dienstplan.termin_themen (termin_id, titel_freitext, position) values (${t.id}, 'Weihnachtsfeier', 1) returning id`;
    const v2 = await planVersion(tx, ENTWURF);
    check("3 Thema am Termin → Version erhöht", tt && v2 > v1, `${v1} -> ${v2}`);
    const vorher = (await tx`select aktualisiert_am a from dienstplan.termine where id = ${t.id}`)[0].a;
    await tx`select pg_sleep(0.01)`;
    await tx`insert into dienstplan.termin_verantwortliche (termin_thema_id, kamerad_id, position) values (${tt.id}, ${ADM}, 1)`;
    const v3 = await planVersion(tx, ENTWURF);
    const nachher = (await tx`select aktualisiert_am a from dienstplan.termine where id = ${t.id}`)[0].a;
    check("3 Verantwortlicher → Version erhöht", v3 > v2, `${v2} -> ${v3}`);
    // now() ist in einer Transaktion konstant: aktualisiert_am bleibt hier gleich, darf aber nicht älter werden
    check("3 Termin wird berührt (aktualisiert_am gesetzt)", nachher >= vorher);
    let e = await fehler(tx, "23514", (sp) => sp`insert into dienstplan.termin_verantwortliche (termin_thema_id, kamerad_id, platzhalter, position) values (${tt.id}, ${ADM}, 'offen', 2)`);
    check("3 Verantwortlicher mit zwei Bezügen → 23514 (genau_ein_bezug)", e.ok, e.got);
    e = await fehler(tx, "23514", (sp) => sp`insert into dienstplan.termin_themen (termin_id, position) values (${t.id}, 2)`);
    check("3 Themenposition ohne Thema und Freitext → 23514", e.ok, e.got);
    await tx`insert into dienstplan.termine (plan_id, datum, kategorie_id, quelle, regel_id, rhythmus_datum) values (${ENTWURF}, '2099-02-03', ${katD}, 'rhythmus', ${regel}, '2099-02-03')`;
    e = await fehler(tx, "23505", (sp) => sp`insert into dienstplan.termine (plan_id, datum, kategorie_id, quelle, regel_id, rhythmus_datum) values (${ENTWURF}, '2099-02-10', ${katD}, 'rhythmus', ${regel}, '2099-02-03')`);
    check("3 zweiter Termin für dieselbe Regel und dasselbe Rhythmusdatum → 23505", e.ok, e.got);
    const upFrei = await tx`update dienstplan.termine set ort = 'Gerätehaus' where id = ${tFrei} returning id`;
    check("3 Planer ändert Termin im freigegebenen Plan (Einzeländerung)", upFrei.length === 1);
    e = await fehler(tx, "42501", (sp) => sp`update dienstplan.plaene set status = 'freigegeben' where id = ${ENTWURF}`);
    check("3 Planer gibt Plan nicht frei (Trigger, 42501)", e.ok, e.got);
    e = await fehler(tx, "42501", (sp) => sp`update dienstplan.plaene set status = 'entwurf', freigegeben_am = null where id = ${FREI}`);
    check("3 Planer setzt Plan nicht auf Entwurf zurück (42501)", e.ok, e.got);
    e = await fehler(tx, "42501", (sp) => sp`insert into dienstplan.plaene (organisation_id, jahr) values (1, 2097)`);
    check("3 Planer legt keinen Plan an (42501)", e.ok, e.got);
    const del = await tx`delete from dienstplan.plaene where id = ${ENTWURF} returning id`;
    check("3 Planer löscht keinen Plan (0 Zeilen)", del.length === 0);
    e = await fehler(tx, "42501", (sp) => sp`insert into dienstplan.kategorien (organisation_id, kuerzel, name, farbe) values (1, 'X', 'x', 'blue')`);
    check("3 Planer legt keine Kategorie an (42501)", e.ok, e.got);
    e = await fehler(tx, "42501", (sp) => sp`insert into dienstplan.ausgleich_personen (organisation_id, kamerad_id) values (1, ${PLN})`);
    check("3 Planer pflegt keine Ausgleichsliste (42501)", e.ok, e.got);
    const th = await tx`insert into dienstplan.themen (organisation_id, titel) values (1, ${stamp + "-thema"}) returning id`;
    check("3 Planer pflegt Themen", th.length === 1);
    const ex = await tx`insert into dienstplan.externe_personen (organisation_id, organisation) values (1, 'DRK') returning id`;
    check("3 Planer legt externe Person an (nur Organisation)", ex.length === 1);
    e = await fehler(tx, "23514", (sp) => sp`insert into dienstplan.externe_personen (organisation_id) values (1)`);
    check("3 externe Person ohne Name und Organisation → 23514", e.ok, e.got);
    check("3 Planer sieht alle Vorschläge", (await anzahl(tx, "themenvorschlaege", `titel like '${stamp}%'`)) === 1);
    const upV = await tx`update dienstplan.themenvorschlaege set status = 'verworfen' where id = ${vorschlagPln} returning id`;
    check("3 Planer verwirft Vorschlag", upV.length === 1);
    const ver = await tx`insert into dienstplan.plan_versionen (plan_id, nummer, anlass, inhalt, erstellt_von) values (${ENTWURF}, 1, 'manuell', '{}', ${PLN}) returning id`;
    check("3 Planer speichert Version", ver.length === 1);
    e = await fehler(tx, "42501", (sp) => sp`insert into dienstplan.plan_versionen (plan_id, nummer, anlass, inhalt, erstellt_von) values (${ENTWURF}, 2, 'manuell', '{}', ${ADM})`);
    check("3 Version im Namen einer anderen Person → 42501", e.ok, e.got);
    e = await fehler(tx, "42501", (sp) => sp`delete from dienstplan.plan_versionen`);
    check("3 Versionen löschen → 42501 (kein Recht)", e.ok, e.got);
    e = await fehler(tx, "42501", (sp) => sp`insert into dienstplan.termine (plan_id, datum, kategorie_id) values (${ORG2}, '2099-03-03', ${katD})`);
    check("3 Termin in Plan der Organisation 2 → 42501", e.ok, e.got);
  });

  // ── 4. Admin ───────────────────────────────────────────────────────────────
  await als(adm, async (tx) => {
    const [p] = await tx`insert into dienstplan.plaene (organisation_id, jahr) values (1, 2097) returning id`;
    check("4 Admin legt Plan an", Boolean(p));
    const fr = await tx`update dienstplan.plaene set status = 'freigegeben', freigegeben_am = now(), freigegeben_von = ${ADM} where id = ${p.id} returning id`;
    check("4 Admin gibt Plan frei", fr.length === 1);
    const kat = await tx`insert into dienstplan.kategorien (organisation_id, kuerzel, name, farbe) values (1, 'X', 'Test', 'yellow') returning id`;
    check("4 Admin legt Kategorie an", kat.length === 1);
    let e = await fehler(tx, "23514", (sp) => sp`insert into dienstplan.kategorien (organisation_id, kuerzel, name, farbe) values (1, 'Y', 'Test', '#ff0000')`);
    check("4 Kategorie mit Hex-Farbe statt Token → 23514", e.ok, e.got);
    e = await fehler(tx, "42501", (sp) => sp`insert into dienstplan.kategorien (organisation_id, kuerzel, name, farbe) values (2, 'X', 'x', 'blue')`);
    check("4 Admin legt Kategorie für Organisation 2 nicht an (42501)", e.ok, e.got);
    check("4 Admin sieht Plan der Organisation 2 nicht", (await anzahl(tx, "plaene", `id = ${ORG2}`)) === 0);
    const del = await tx`delete from dienstplan.plaene where id = ${ENTWURF} returning id`;
    check("4 Admin löscht Plan (Termine per Kaskade)", del.length === 1 && (await anzahl(tx, "termine", `plan_id = ${ENTWURF}`)) === 0);
    const au = await tx`insert into dienstplan.ausgleich_personen (organisation_id, kamerad_id) values (1, ${PLN}) returning kamerad_id`;
    check("4 Admin pflegt Ausgleichsliste", au.length === 1);
    e = await fehler(tx, "23514", (sp) => sp`insert into dienstplan.rhythmus_regeln (organisation_id, name, typ, wochentag, uhrzeit, gueltig_ab) values (1, 'kaputt', 'wochen_zyklus', 2, '19:30', '2026-01-01')`);
    check("4 Regel wochen_zyklus ohne Anker/Muster → 23514", e.ok, e.got);
  });
  await als(G("Admin", 2), async (tx) => {
    const p = (await tx`select id from dienstplan.plaene where jahr >= 2096`).map((x) => x.id);
    check("4 Admin im Scope Organisation 2 sieht nur deren Plan", p.length === 1 && p[0] === ORG2, JSON.stringify(p));
  });

  // ── 5. Rolle dienst_rolle in core ──────────────────────────────────────────
  const [{ id: benPln }] = await owner`insert into core.benutzer (benutzername, pin, rolle, kamerad_id) values (${stamp + "-pln"}, 'x', 'User', ${PLN}) returning id`;
  ids.ben.push(benPln);
  await als({ "app.kamerad_id": ADM, "app.app_rolle": "Admin" }, async (tx) => {
    const tv0 = (await tx`select token_version tv from core.benutzer where id = ${benPln}`)[0].tv;
    const n = (await tx`select core.set_kamerad_rollen(${PLN}::integer, '{"dienst_rolle":"Planer"}'::jsonb) n`)[0].n;
    const z = (await tx`select dienst_rolle from core.kameraden where id = ${PLN}`)[0];
    const tv1 = (await tx`select token_version tv from core.benutzer where id = ${benPln}`)[0].tv;
    check("5 set_kamerad_rollen setzt dienst_rolle, token_version +1", z.dienst_rolle === "Planer" && n === 1 && tv1 === tv0 + 1, `${z.dienst_rolle} ${tv0}->${tv1}`);
    const aud = await tx`select abschnitt, feld, neu from core.mitglieder_audit where kamerad_id = ${PLN} and feld = 'dienst_rolle'`;
    check("5 Änderungsprotokoll: dienst_rolle im Abschnitt rollen", aud.some((x) => x.abschnitt === "rollen" && x.neu === "Planer"));
    await tx`select core.set_kamerad_rollen(${PLN}::integer, '{"dienst_rolle":""}'::jsonb)`;
    check("5 leerer Wert entfernt dienst_rolle", (await tx`select dienst_rolle from core.kameraden where id = ${PLN}`)[0].dienst_rolle === null);
    const e = await fehler(tx, "42501", (sp) => sp`update core.kameraden set dienst_rolle = 'Admin' where id = ${PLN}`);
    check("5 dienst_rolle direkt per UPDATE → 42501 (Spaltenrecht)", e.ok, e.got);
    const e2 = await fehler(tx, "22023", (sp) => sp`select core.set_kamerad_rollen(${PLN}::integer, '{"dienstplan":"Admin"}'::jsonb)`);
    check("5 unbekannter Schlüssel weiter abgelehnt (22023)", e2.ok, e2.got);
  });
  await als({ "app.kamerad_id": PLN, "app.psa_rolle": "Kleiderwart" }, async (tx) => {
    const e = await fehler(tx, "42501", (sp) => sp`select core.set_kamerad_rollen(${PLN}::integer, '{"dienst_rolle":"Admin"}'::jsonb)`);
    check("5 set_kamerad_rollen ohne globalen Admin → 42501", e.ok, e.got);
  });

  // ── 6. Anzeige-Scope (Migration 0019) ──────────────────────────────────────
  const { createHash } = await import("node:crypto");
  const h = (x) => createHash("sha256").update(x).digest("hex");
  const HG = h(stamp + "-gueltig"), HA = h(stamp + "-abgelaufen"), HO = h(stamp + "-org2");
  await owner`insert into dienstplan.anzeige_tokens (organisation_id, plan_id, token_hash, gueltig_bis, erstellt_von) values
    (1, ${ENTWURF}, ${HG}, now() + interval '1 hour', ${PLN}),
    (1, ${FREI}, ${HA}, now() - interval '1 minute', ${PLN}),
    (2, ${ORG2}, ${HO}, now() + interval '1 hour', ${PLN})`;
  const A = (hash) => ({ "app.dienst_rolle": "Anzeige", "app.dienst_anzeige": hash });
  await als(A(HG), async (tx) => {
    check("6 Anzeige: sieht nur die eigene Token-Zeile", (await anzahl(tx, "anzeige_tokens")) === 1);
    const pl = await tx`select id from dienstplan.plaene`;
    check("6 Anzeige: sieht genau den Plan des Tokens (Entwurf)", pl.length === 1 && pl[0].id === ENTWURF, JSON.stringify(pl));
    check("6 Anzeige: Termine des Plans sichtbar, andere nicht", (await anzahl(tx, "termine")) === 1 && (await anzahl(tx, "termine", `id = ${tFrei}`)) === 0);
    check("6 Anzeige: Kategorien nur der eigenen Organisation", (await anzahl(tx, "kategorien", "organisation_id = 2")) === 0 && (await anzahl(tx, "kategorien")) > 0);
    check("6 Anzeige: keine Regeln, keine Vorschläge, keine Versionen",
      (await anzahl(tx, "rhythmus_regeln")) === 0 && (await anzahl(tx, "themenvorschlaege")) === 0 && (await anzahl(tx, "plan_versionen")) === 0);
    check("6 Anzeige: kameraden_namen() liefert Namen", (await tx`select count(*)::int n from dienstplan.kameraden_namen()`)[0].n > 0);
    const u = await tx`update dienstplan.termine set ort = 'x' where id = ${tEntwurf} returning id`;
    check("6 Anzeige: Termin ändern wirkt nicht (0 Zeilen)", u.length === 0);
    const u2 = await tx`update dienstplan.plaene set fokus_termin_id = ${tEntwurf} where id = ${ENTWURF} returning id`;
    check("6 Anzeige: Fokus setzen wirkt nicht (0 Zeilen)", u2.length === 0);
    const e = await fehler(tx, "42501", (sp) => sp`insert into dienstplan.anzeige_tokens (organisation_id, plan_id, token_hash, gueltig_bis, erstellt_von)
      values (1, ${ENTWURF}, ${h(stamp + "x")}, now() + interval '1 hour', ${PLN})`);
    check("6 Anzeige: kein neues Token anlegen (42501)", e.ok, e.got);
  });
  await als(A(HA), async (tx) => {
    check("6 Anzeige abgelaufen: sieht keinen Plan", (await anzahl(tx, "plaene")) === 0 && (await anzahl(tx, "termine")) === 0);
    const e = await fehler(tx, "42501", (sp) => sp`select * from dienstplan.kameraden_namen()`);
    check("6 Anzeige abgelaufen: kameraden_namen() → 42501", e.ok, e.got);
  });
  await als(A(h("gibt-es-nicht")), async (tx) => {
    check("6 Anzeige mit unbekanntem Hash: sieht nichts", (await anzahl(tx, "plaene")) === 0 && (await anzahl(tx, "kategorien")) === 0 && (await anzahl(tx, "anzeige_tokens")) === 0);
  });
  await als({ "app.dienst_anzeige": HG, "app.dienst_rolle": "Mitglied", "app.dienst_org": 1, "app.kamerad_id": MIT }, async (tx) => {
    check("6 Mitglied mit gesetztem Hash: sieht keine Tokens und keinen Entwurf",
      (await anzahl(tx, "anzeige_tokens")) === 0 && (await anzahl(tx, "plaene", `id = ${ENTWURF}`)) === 0);
  });
  await als(pln, async (tx) => {
    check("6 Planer: sieht Tokens der eigenen Organisation", (await anzahl(tx, "anzeige_tokens")) === 2);
    const [t] = await tx`insert into dienstplan.anzeige_tokens (organisation_id, plan_id, token_hash, gueltig_bis, erstellt_von)
      values (1, ${ENTWURF}, ${h(stamp + "p")}, now() + interval '12 hours', ${PLN}) returning id`;
    check("6 Planer: legt Token an", !!t);
    let e = await fehler(tx, "42501", (sp) => sp`insert into dienstplan.anzeige_tokens (organisation_id, plan_id, token_hash, gueltig_bis, erstellt_von)
      values (1, ${ENTWURF}, ${h(stamp + "q")}, now() + interval '30 hours', ${PLN})`);
    check("6 Planer: Token länger als 24 h → 42501", e.ok, e.got);
    e = await fehler(tx, "42501", (sp) => sp`insert into dienstplan.anzeige_tokens (organisation_id, plan_id, token_hash, gueltig_bis, erstellt_von)
      values (1, ${ENTWURF}, ${h(stamp + "r")}, now() + interval '1 hour', ${ADM})`);
    check("6 Planer: Token im Namen eines anderen → 42501", e.ok, e.got);
    e = await fehler(tx, "42501", (sp) => sp`insert into dienstplan.anzeige_tokens (organisation_id, plan_id, token_hash, gueltig_bis, erstellt_von)
      values (1, ${ORG2}, ${h(stamp + "s")}, now() + interval '1 hour', ${PLN})`);
    check("6 Planer: Token für Plan einer anderen Organisation → 42501", e.ok, e.got);
    const f = await tx`update dienstplan.plaene set fokus_termin_id = ${tEntwurf} where id = ${ENTWURF} returning version`;
    check("6 Planer: Fokus setzen, Version bleibt", f.length === 1 && f[0].version === (await planVersion(tx, ENTWURF)));
  });
  await als(mit, async (tx) => {
    const e = await fehler(tx, "42501", (sp) => sp`insert into dienstplan.anzeige_tokens (organisation_id, plan_id, token_hash, gueltig_bis, erstellt_von)
      values (1, ${FREI}, ${h(stamp + "m")}, now() + interval '1 hour', ${MIT})`);
    check("6 Mitglied: kein Token anlegen (42501)", e.ok, e.got);
    const u = await tx`update dienstplan.plaene set fokus_termin_id = ${tFrei} where id = ${FREI} returning id`;
    check("6 Mitglied: Fokus setzen wirkt nicht", u.length === 0);
  });

  // ── 7. Vorjahresanzeige: vorjahr_themen() (Migration 0020) ─────────────────
  // FREI = 2098 freigegeben, ENTWURF = 2099 Entwurf (Vorjahr von 2100), HG = Token für 2099
  const [{ id: thFrei }] = await owner`insert into dienstplan.termin_themen (termin_id, position, titel_freitext) values (${tFrei}, 1, ${stamp + "-vj"}) returning id`;
  await owner`insert into dienstplan.termin_verantwortliche (termin_thema_id, position, kamerad_id) values (${thFrei}, 1, ${MIT})`;
  const vj = (tx, jahr) => tx`select datum::text as datum, kuerzel, ausgefallen, titel from dienstplan.vorjahr_themen(${jahr}::integer)`;
  await als(A(HG), async (tx) => {
    const r = await vj(tx, 2099);
    check("7 Anzeige: Vorjahr (freigegeben) mit Thementitel", r.length === 1 && r[0].datum === "2098-01-06" && r[0].titel[0] === stamp + "-vj", JSON.stringify(r));
    check("7 Anzeige: nur Titel, keine Namen", !JSON.stringify(r).includes(stamp + "-mit"));
    check("7 Anzeige: Scope danach unverändert (nur Token-Plan sichtbar)", (await anzahl(tx, "plaene")) === 1 && (await tx`select current_setting('app.dienst_rolle') r`)[0].r === "Anzeige");
    const e = await fehler(tx, "42501", (sp) => vj(sp, 2100));
    check("7 Anzeige: anderes Jahr als der Token-Plan → 42501", e.ok, e.got);
  });
  await als(A(HA), async (tx) => {
    const e = await fehler(tx, "42501", (sp) => vj(sp, 2098));
    check("7 Anzeige abgelaufen: vorjahr_themen → 42501", e.ok, e.got);
  });
  await als(mit, async (tx) => {
    check("7 Mitglied: Vorjahr freigegeben sichtbar", (await vj(tx, 2099)).length === 1);
    check("7 Mitglied: Vorjahr im Entwurf nicht sichtbar", (await vj(tx, 2100)).length === 0);
    check("7 Mitglied: Scope danach unverändert", (await tx`select current_setting('app.dienst_org') o`)[0].o === "1");
  });
  await als(pln, async (tx) => {
    check("7 Planer: Vorjahr im Entwurf sichtbar", (await vj(tx, 2100)).length === 1);
    check("7 Planer: fremde Organisation nicht", (await vj(tx, 2100)).every((x) => x.datum === "2099-01-06"));
  });
  await als({}, async (tx) => {
    const e = await fehler(tx, "42501", (sp) => vj(sp, 2099));
    check("7 Ohne Scope: vorjahr_themen → 42501", e.ok, e.got);
  });

  // ── 8. Versionen lesen (Migration 0021) ────────────────────────────────────
  // Je Plan eine manuelle und eine Freigabe-Version (als Owner angelegt).
  const ver = async (planId, nummer, anlass) =>
    owner`insert into dienstplan.plan_versionen (plan_id, nummer, anlass, inhalt, erstellt_von) values (${planId}, ${nummer}, ${anlass}, '{"termine":[]}', ${ADM})`;
  for (const pid of [ENTWURF, FREI]) { await ver(pid, 1, "manuell"); await ver(pid, 2, "freigabe"); }
  await ver(ORG2, 1, "freigabe");
  const HF = h(stamp + "-frei");
  await owner`insert into dienstplan.anzeige_tokens (organisation_id, plan_id, token_hash, gueltig_bis, erstellt_von)
    values (1, ${FREI}, ${HF}, now() + interval '1 hour', ${PLN})`;
  const versionen = (tx) => tx`select plan_id, nummer, anlass from dienstplan.plan_versionen order by plan_id, nummer`;
  await als(mit, async (tx) => {
    const v = await versionen(tx);
    check("8 Mitglied: nur die Freigabe-Version des freigegebenen Plans", v.length === 1 && v[0].plan_id === FREI && v[0].anlass === "freigabe", JSON.stringify(v));
    const e = await fehler(tx, "42501", (sp) => sp`insert into dienstplan.plan_versionen (plan_id, nummer, anlass, inhalt, erstellt_von) values (${FREI}, 9, 'manuell', '{}', ${MIT})`);
    check("8 Mitglied: Version anlegen → 42501", e.ok, e.got);
  });
  await als(pln, async (tx) => {
    const v = await versionen(tx);
    check("8 Planer: alle Versionen der eigenen Organisation (4), keine der Organisation 2", v.length === 4 && v.every((x) => x.plan_id !== ORG2), JSON.stringify(v));
  });
  await als(G("Mitglied", 2, MIT2), async (tx) => {
    check("8 Mitglied Organisation 2: Plan im Entwurf → keine Version", (await versionen(tx)).length === 0);
  });
  await als(A(HF), async (tx) => {
    check("8 Anzeige (Token freigegebener Plan): keine Versionen", (await versionen(tx)).length === 0);
  });
  await als({}, async (tx) => {
    check("8 Ohne Scope: keine Versionen", (await versionen(tx)).length === 0);
  });

  // ── 9. iCal-Abo: ical_abos und abo_scope() (Migration 0022) ────────────────
  // Org 1 hat evtl. schon ein aktives Abo (Entwicklungsdaten): Testabo nur für Org 2.
  const HAB = h(stamp + "-abo"), HWD = h(stamp + "-abo-alt");
  await owner`insert into dienstplan.ical_abos (organisation_id, token_hash, erstellt_von, widerrufen_am) values (2, ${HWD}, ${ADM}, now())`;
  await owner`insert into dienstplan.ical_abos (organisation_id, token_hash, erstellt_von) values (2, ${HAB}, ${ADM})`;
  await owner.begin(async (tx) => {
    await tx`select set_config('app.dienst_rolle', 'Admin', true)`;
    await tx`update dienstplan.plaene set status = 'freigegeben' where id = ${ORG2}`;
  });
  await als({}, async (tx) => {
    const [r] = await tx`select dienstplan.abo_scope(${HAB}) as org`;
    check("9 abo_scope: gültiges Token → Organisation 2", r.org === 2);
    const g = (await tx`select current_setting('app.dienst_rolle') r, current_setting('app.dienst_org') o, current_setting('app.kamerad_id') k`)[0];
    check("9 abo_scope: setzt Mitglied, Organisation, kamerad_id 0", g.r === "Mitglied" && g.o === "2" && g.k === "0", JSON.stringify(g));
    const pl = await tx`select id, status from dienstplan.plaene`;
    check("9 Abo-Scope: sieht nur freigegebene Pläne der eigenen Organisation", pl.length === 1 && pl[0].id === ORG2, JSON.stringify(pl));
    check("9 Abo-Scope: sieht keine Abos (kein Admin)", (await anzahl(tx, "ical_abos")) === 0);
    const u = await tx`update dienstplan.termine set ort = 'x' returning id`;
    check("9 Abo-Scope: schreibt nichts (0 Zeilen)", u.length === 0);
  });
  // Der Abrufzähler wird mit der Transaktion zurückgerollt; gezählt wird im API-Test (test-dienstplan-export).
  for (const [n, hash] of [["widerrufenes", HWD], ["unbekanntes", h(stamp + "-nix")], ["kaputtes", "abc"]]) {
    await als({}, async (tx) => {
      const e = await fehler(tx, "42501", (sp) => sp`select dienstplan.abo_scope(${hash})`);
      check(`9 abo_scope: ${n} Token → 42501`, e.ok, e.got);
    });
  }
  await als(mit, async (tx) => {
    const e = await fehler(tx, "42501", (sp) => sp`select dienstplan.abo_scope(${HAB})`);
    check("9 abo_scope: in bestehendem Scope → 42501", e.ok, e.got);
  });
  await als({ "app.kamerad_id": MIT }, async (tx) => {
    const e = await fehler(tx, "42501", (sp) => sp`select dienstplan.abo_scope(${HAB})`);
    check("9 abo_scope: mit gesetzter kamerad_id → 42501", e.ok, e.got);
  });
  await als(G("Admin", 2, ADM), async (tx) => {
    check("9 Admin Org 2: sieht beide Abos der Organisation", (await anzahl(tx, "ical_abos")) === 2);
    const e = await fehler(tx, "23505", (sp) => sp`insert into dienstplan.ical_abos (organisation_id, token_hash, erstellt_von) values (2, ${h(stamp + "-zwei")}, ${ADM})`);
    check("9 zweites aktives Abo → 23505", e.ok, e.got);
    const e2 = await fehler(tx, "42501", (sp) => sp`insert into dienstplan.ical_abos (organisation_id, token_hash, erstellt_von, widerrufen_am) values (2, ${h(stamp + "-x")}, ${PLN}, now())`);
    check("9 Abo im Namen einer anderen Person → 42501", e2.ok, e2.got);
    const e3 = await fehler(tx, "42501", (sp) => sp`update dienstplan.ical_abos set abrufe = 0`);
    check("9 Zähler ändern → 42501 (nur widerrufen_am)", e3.ok, e3.got);
    const w = await tx`update dienstplan.ical_abos set widerrufen_am = now() where token_hash = ${HAB} returning id`;
    check("9 Admin widerruft", w.length === 1);
  });
  await als(G("Admin", 1, ADM), async (tx) => {
    check("9 Admin Org 1: sieht Abos der Organisation 2 nicht", (await anzahl(tx, "ical_abos", "organisation_id = 2")) === 0);
  });
  await als(G("Planer", 2, PLN), async (tx) => {
    check("9 Planer: sieht keine Abos", (await anzahl(tx, "ical_abos")) === 0);
    const e = await fehler(tx, "42501", (sp) => sp`insert into dienstplan.ical_abos (organisation_id, token_hash, erstellt_von) values (2, ${h(stamp + "-p")}, ${PLN})`);
    check("9 Planer: Abo anlegen → 42501", e.ok, e.got);
  });
  check("9 Policies in dienstplan: 50", (await owner`select count(*)::int n from pg_policies where schemaname = 'dienstplan'`)[0].n === 50);
} finally {
  try {
    if (ids.plan.length) await owner`delete from dienstplan.plaene where id in ${owner(ids.plan)}`;
    await owner`delete from dienstplan.themenvorschlaege where titel like ${stamp + "%"}`;
    await owner`delete from dienstplan.ical_abos where organisation_id = 2`;
    await owner`delete from dienstplan.kategorien where organisation_id = 2`;
    if (ids.org2) await owner`delete from dienstplan.organisationen where id = 2 and name like ${stamp + "%"}`;
    if (ids.ben.length) await owner`delete from core.benutzer where id in ${owner(ids.ben)}`;
    if (ids.kam.length) await owner`delete from core.mitglieder_audit where kamerad_id in ${owner(ids.kam)}`;
    if (ids.kam.length) await owner`delete from core.kameraden where id in ${owner(ids.kam)}`;
    const [rest] = await owner`select
      (select count(*)::int from core.kameraden where name like ${stamp + "%"}) k,
      (select count(*)::int from dienstplan.plaene where jahr between 2096 and 2099) p,
      (select count(*)::int from dienstplan.organisationen where id <> 1) o`;
    console.log(`Aufräumen: ${ids.plan.length} Pläne, ${ids.kam.length} Kameraden; Rest: ${rest.k} Kameraden, ${rest.p} Testpläne, ${rest.o} fremde Organisationen`);
    if (rest.k + rest.p + rest.o > 0) fail++;
  } catch (e) { console.log("AUFRÄUMEN FEHLGESCHLAGEN:", e.message); fail++; }
  await app.end({ timeout: 5 }); await owner.end({ timeout: 5 });
}
console.log(`\n${ok} OK, ${fail} Fehler`);
process.exit(fail ? 1 : 0);
