// Staffelungstest der Migrationen: baut in einer Wegwerf-Datenbank den Produktionsstand vor der
// Härtung nach (Migrationen bis 0011, alte Policies und tabellenweite Rechte aus den manuellen
// Skripten) und spielt dann 0012, 0013, 0014 und 0015 einzeln über `scripts/migrate.mjs --bis`
// ein. Geprüft werden nach jedem Schritt Migrationszahl, Policies, Trigger, RLS-Flags, Rechte und
// das Verhalten als fw_app (Kleiderwart darf Kameraden bis 0014 ändern und anlegen, ab 0015 nicht
// mehr; PSA Admin ebenso; globaler Admin darf weiter). Zum Schluss ist ein erneuter Lauf ein No-op.
// Der Test endet bewusst bei 0015; spätere Migrationen berühren ihn nicht.
//
// Aufruf:  node scripts/test-migr-bis.mjs
// Env (aus .env.local, falls vorhanden): MIGRATE_DATABASE_URL (Owner, braucht CREATEDB)
// Die Datenbank fwhub_migr_test wird angelegt und am Ende wieder gelöscht. Voraussetzung: Die
// Rollen fw_app und fw_auth existieren im Cluster (drizzle/manual/create-fw-app-role.sql).
// Bricht ab, wenn die Datenbank nicht lokal ist. Es wird nie fwhub_dev angefasst.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const P = resolve(fileURLToPath(new URL("..", import.meta.url)));
if (existsSync(`${P}/.env.local`)) process.loadEnvFile(`${P}/.env.local`);
if (!process.env.MIGRATE_DATABASE_URL) { console.error("Abbruch: MIGRATE_DATABASE_URL ist nicht gesetzt."); process.exit(2); }
const lokal = (h) => ["localhost", "127.0.0.1", "[::1]", "::1"].includes(h);
if (!lokal(new URL(process.env.MIGRATE_DATABASE_URL).hostname)) { console.error("Abbruch: Datenbank ist nicht lokal."); process.exit(2); }
const DB = "fwhub_migr_test";
const x = new URL(process.env.MIGRATE_DATABASE_URL); x.pathname = `/${DB}`;
const env = { ...process.env, MIGRATE_DATABASE_URL: x.toString() };
const postgres = (await import(pathToFileURL(createRequire(`${P}/package.json`).resolve("postgres")).href)).default;
const admin = new URL(process.env.MIGRATE_DATABASE_URL); admin.pathname = "/postgres";
const adm = postgres(admin.toString(), { max: 1, onnotice: () => {} });
await adm.unsafe(`drop database if exists ${DB}`);
await adm.unsafe(`create database ${DB}`);
const q = postgres(x.toString(), { max: 1, onnotice: () => {} });
let fail = 0; const check = (n, c, i = "") => { if (!c) fail++; console.log(`${c ? "OK  " : "FEHLER"} ${n}${i ? " — " + i : ""}`); };
const run = (...a) => { const r = spawnSync(process.execPath, [`${P}/scripts/migrate.mjs`, ...a], { cwd: P, env, encoding: "utf8" }); return { code: r.status, out: (r.stdout + r.stderr).trim().split("\n").slice(-3).join(" | ") }; };
const zustand = async () => ({
  n: (await q`select count(*)::int n from drizzle.__drizzle_migrations`)[0].n,
  pol: (await q`select policyname from pg_policies where schemaname='core' and tablename in ('kameraden','benutzer')`).map((r) => r.policyname),
  trig: (await q`select count(*)::int n from pg_trigger where not tgisinternal and tgrelid = 'core.kameraden'::regclass`)[0].n,
});
try {
  const v = run("--bis", "0011");
  check("Frische DB: migrate --bis 0011 (Stand vor der Härtung)", v.code === 0, v.out);
  // Produktionsstand nachbauen: alte Policies und tabellenweite Rechte stammen aus den manuellen Skripten.
  await q.unsafe(`
    -- bewusst KEIN ENABLE/FORCE ROW LEVEL SECURITY: das muss 0012 selbst erledigen
    CREATE POLICY kameraden_scope ON core.kameraden FOR ALL
      USING (current_setting('app.psa_rolle', true) IN ('Admin','Kleiderwart') OR id = NULLIF(current_setting('app.kamerad_id', true), '')::int)
      WITH CHECK (current_setting('app.psa_rolle', true) IN ('Admin','Kleiderwart') OR id = NULLIF(current_setting('app.kamerad_id', true), '')::int);
    CREATE POLICY benutzer_scope ON core.benutzer FOR ALL
      USING (current_setting('app.psa_rolle', true) IN ('Admin','Kleiderwart') OR kamerad_id = NULLIF(current_setting('app.kamerad_id', true), '')::int)
      WITH CHECK (current_setting('app.psa_rolle', true) IN ('Admin','Kleiderwart') OR kamerad_id = NULLIF(current_setting('app.kamerad_id', true), '')::int);
    GRANT USAGE ON SCHEMA core TO fw_app;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA core TO fw_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON core.kameraden, core.benutzer TO fw_app;`);
  const rls = async () => (await q`select relname, relrowsecurity r, relforcerowsecurity f from pg_class where oid in ('core.kameraden'::regclass,'core.benutzer'::regclass)`).map((x) => `${x.relname}:${x.r}/${x.f}`).sort().join(" ");
  check("Vorher: RLS auf kameraden/benutzer noch NICHT aktiv", (await rls()) === "benutzer:false/false kameraden:false/false", await rls());
  let z = await zustand();
  check("Vorher: alte Policies da, 11 Migrationen, kein Trigger", z.pol.includes("kameraden_scope") && z.pol.includes("benutzer_scope") && z.n === 12 && z.trig === 0, `${z.n} Migr.`);

  const a = run("--bis", "0012");
  check("Dann: migrate --bis 0012 erfolgreich", a.code === 0, a.out);
  z = await zustand();
  check("Nach 0012: 13 Migrationen", z.n === 13, String(z.n));
  check("Nach 0012: ENABLE + FORCE RLS auf kameraden und benutzer gesetzt", (await rls()) === "benutzer:true/true kameraden:true/true", await rls());
  check("Nach 0012 (additiv): alte UND neue Policies, Trigger vorhanden", z.pol.includes("kameraden_scope") && z.pol.includes("benutzer_scope") && z.pol.includes("kameraden_lesen") && z.pol.includes("benutzer_update") && z.trig === 1, z.pol.join(","));
  const [{ ins }] = await q`select has_table_privilege('fw_app', 'core.kameraden', 'INSERT') ins`;
  const [{ kid0 }] = await q`select has_column_privilege('fw_app', 'core.kameraden', 'karten_id', 'UPDATE') kid0`;
  check("Nach 0012: fw_app hat noch tabellenweites INSERT/UPDATE (alte App läuft)", ins === true && kid0 === true);

  const b = run("--bis", "0013");
  check("Dann: migrate --bis 0013 wendet nur 0013 an", b.code === 0 && /13 -> 14/.test(b.out), b.out);
  z = await zustand();
  check("Nach 0013: 14 Migrationen, alte Policies weg, neue da", z.n === 14 && !z.pol.includes("kameraden_scope") && !z.pol.includes("benutzer_scope") && z.pol.includes("kameraden_aendern"), z.pol.join(","));
  const [{ ins2 }] = await q`select has_table_privilege('fw_app', 'core.kameraden', 'INSERT') ins2`;
  const [{ kid }] = await q`select has_column_privilege('fw_app', 'core.kameraden', 'karten_id', 'UPDATE') kid`;
  const [{ nm }] = await q`select has_column_privilege('fw_app', 'core.kameraden', 'name', 'UPDATE') nm`;
  check("Nach 0013: kein tabellenweites INSERT, kein UPDATE auf karten_id, UPDATE auf name bleibt", ins2 === false && kid === false && nm === true);

  // Verhalten als fw_app mit Kleiderwart-GUCs bzw. globalem Admin (Owner-Transaktion, set local role)
  const [{ id: kid1 }] = await q`insert into core.kameraden (name, vorname) values ('Stufen', 'Test') returning id`;
  const als = async (gucs, fn) => {
    let res; const sentinel = new Error("rollback");
    try { await q.begin(async (tx) => { await tx.unsafe("set local role fw_app"); for (const [k, v] of Object.entries(gucs)) await tx`select set_config(${k}, ${v}, true)`; res = await fn(tx); throw sentinel; }); } catch (e) { if (e !== sentinel) throw e; }
    return res;
  };
  const kw = { "app.kamerad_id": String(kid1), "app.psa_rolle": "Kleiderwart" };
  const adm = { "app.kamerad_id": String(kid1), "app.app_rolle": "Admin" };
  const upd = (tx) => tx`update core.kameraden set vorname = 'X' where id = ${kid1} returning id`;
  const anlegen = async (tx) => { try { await tx.savepoint(async (sp) => { await sp`insert into core.kameraden (name, vorname) values ('N', 'N')`; }); return "ok"; } catch (e) { return e.code; } };
  { const r = await als(kw, async (tx) => `${(await upd(tx)).length}/${await anlegen(tx)}`); check("Nach 0013: Kleiderwart ändert Kamerad (1 Zeile) und legt an", r === "1/ok", r); }

  const d14 = run("--bis", "0014");
  check("Dann: migrate --bis 0014 (Audit) wendet nur 0014 an", d14.code === 0 && /14 -> 15/.test(d14.out), d14.out);
  check("Nach 0014: Kleiderwart darf Kameraden noch ändern und anlegen (Übergang)", (await als(kw, async (tx) => `${(await upd(tx)).length}/${await anlegen(tx)}`)) === "1/ok");

  const d15 = run("--bis", "0015");
  check("Dann: migrate --bis 0015 wendet nur 0015 an", d15.code === 0 && /15 -> 16/.test(d15.out), d15.out);
  z = await zustand();
  check("Nach 0015: 16 Migrationen", z.n === 16, String(z.n));
  const defs = await q`select policyname, coalesce(qual,'') || ' ' || coalesce(with_check,'') d from pg_policies where schemaname='core' and tablename='kameraden' and policyname in ('kameraden_anlegen','kameraden_aendern')`;
  check("Nach 0015: kameraden_anlegen/aendern nur noch app_rolle Admin (kein psa_rolle)", defs.length === 2 && defs.every((r) => r.d.includes("app_rolle") && !r.d.includes("psa_rolle")), defs.map((r) => r.d).join(" | "));
  check("Nach 0015: Kleiderwart ändert 0 Zeilen, Anlegen 42501", (await als(kw, async (tx) => `${(await upd(tx)).length}/${await anlegen(tx)}`)) === "0/42501");
  check("Nach 0015: PSA Admin ebenso", (await als({ "app.kamerad_id": String(kid1), "app.psa_rolle": "Admin" }, async (tx) => `${(await upd(tx)).length}/${await anlegen(tx)}`)) === "0/42501");
  { const r = await als(adm, async (tx) => `${(await upd(tx)).length}/${await anlegen(tx)}`); check("Nach 0015: globaler Admin ändert und legt an", r === "1/ok", r); }
  check("Nach 0015: Kleiderwart liest weiterhin alle Kameraden", (await als(kw, async (tx) => (await tx`select id from core.kameraden`).length)) >= 1);
  const c = run("--bis", "0015");
  check("Erneuter Lauf ist ein No-op", c.code === 0 && /16 -> 16/.test(c.out), c.out);
} finally { await q.end(); await adm.unsafe(`drop database if exists ${DB}`); await adm.end(); }
process.exit(fail ? 1 : 0);
