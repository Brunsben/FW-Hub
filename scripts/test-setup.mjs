// Erst-Einrichtung (/setup) in einer Wegwerf-Datenbank mit leerem core.benutzer.
//
// Aufruf:  node scripts/test-setup.mjs
// Env (aus .env.local, falls vorhanden): DATABASE_URL (fw_app), AUTH_DATABASE_URL (fw_auth),
//   MIGRATE_DATABASE_URL (Owner, braucht CREATEDB)
// Ablauf: Legt fwhub_setup_test als Kopie von fwhub_dev an (CREATE DATABASE ... TEMPLATE; dafür darf
// niemand mit fwhub_dev verbunden sein, also den Dev-Server auf 3100 vorher beenden), leert dort
// core.benutzer, core.kameraden und alles, was daran hängt, und prüft
//   Teil 1 (Datenbank als fw_app): Setup-Schritte (Kamerad über die Stammdaten-Teilsicht, vier Rollen über
//          core.set_kamerad_rollen, Admin-Benutzer) gehen nur im Scope des globalen Admins.
//   Teil 2 (HTTP): startet einen eigenen Dev-Server auf Port 3101 gegen die Kopie: leere DB leitet auf
//          /setup, /setup zeigt Umschalter und Formular ohne Kopfzeile, PIN < 6 → 400, Setup → 200 mit
//          JWT (Admin, tv 0, alle Modulrollen), Kacheln, danach /setup → /login, zweites Setup → 400.
// Am Ende wird der Server beendet und die Wegwerf-Datenbank gelöscht. fwhub_dev wird nie verändert.
// Bricht ab (Exit 2), wenn eine der Datenbank-URLs nicht lokal ist. Secrets werden nie ausgegeben.
import { beendeProzess, starteProzess } from "./lib/prozess.mjs";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { schutz } from "./lib/schutz.mjs";

const P = resolve(fileURLToPath(new URL("..", import.meta.url)));
if (existsSync(`${P}/.env.local`)) process.loadEnvFile(`${P}/.env.local`);
schutz({ db: ["DATABASE_URL", "AUTH_DATABASE_URL", "MIGRATE_DATABASE_URL"] });
const COPY_DB = "fwhub_setup_test", PORT = 3101, BASE = `http://localhost:${PORT}`;
const QUELLE = new URL(process.env.MIGRATE_DATABASE_URL).pathname.slice(1);
const toDb = (u, db) => { const x = new URL(u); x.pathname = `/${db}`; return x.toString(); };
const env = { ...process.env, DATABASE_URL: toDb(process.env.DATABASE_URL, COPY_DB), AUTH_DATABASE_URL: toDb(process.env.AUTH_DATABASE_URL, COPY_DB), MIGRATE_DATABASE_URL: toDb(process.env.MIGRATE_DATABASE_URL, COPY_DB) };
const req = createRequire(`${P}/package.json`);
const imp = async (m) => import(pathToFileURL(req.resolve(m)).href);
const postgres = (await imp("postgres")).default;
const { drizzle } = await imp("drizzle-orm/postgres-js");
const pg = await imp("drizzle-orm/pg-core");

let fail = 0;
const check = (n, c, i = "") => { if (!c) fail++; console.log(`${c ? "OK  " : "FEHLER"} ${n}${i ? " — " + i : ""}`); };
const adm = postgres(toDb(process.env.MIGRATE_DATABASE_URL, "postgres"), { max: 1, onnotice: () => {} });
let owner = null, app = null, child = null, log = "";
const stop = () => { if (child) { beendeProzess(child); child = null; } };

try {
  await adm.unsafe(`drop database if exists ${COPY_DB}`);
  await adm.unsafe(`create database ${COPY_DB} template ${QUELLE}`);
  owner = postgres(env.MIGRATE_DATABASE_URL, { max: 1, onnotice: () => {} });
  await owner`truncate core.benutzer, core.kameraden, core.login_attempts, core.mitglieder_audit cascade`;
  app = postgres(env.DATABASE_URL, { max: 1, onnotice: () => {} });
  const [{ u, db, n }] = await app`select current_user u, current_database() db, (select count(*)::int from core.benutzer) n`;
  check("Wegwerf-Datenbank, Verbindung als fw_app, core.benutzer leer", u === "fw_app" && db === COPY_DB && n === 0, `${u} ${db} ${n}`);
  if (db !== COPY_DB || n !== 0) throw new Error("Abbruch: falsche Datenbank");

  // ── Teil 1: Setup-Schritte auf Datenbankebene ──
  const core = pg.pgSchema("core");
  const stamm = core.table("kameraden", { name: pg.text("name").notNull(), vorname: pg.text("vorname").notNull(), dienstgrad: pg.text("dienstgrad"), email: pg.text("email"), personalnummer: pg.text("personalnummer"), aktiv: pg.boolean("aktiv").notNull().default(true) });
  const voll = core.table("kameraden", { id: pg.serial("id").primaryKey() });
  const q = drizzle(app).insert(stamm).values({ vorname: "Test", name: "Setup" }).returning({ id: voll.id }).toSQL();
  check("Teilsicht-INSERT nennt nur Stammdaten-Spalten (nicht karten_id oder Rollen)", !/karten_id|psa_rolle|food_rolle|funk_rolle|fk_rolle|dienst_rolle/.test(q.sql), q.sql);
  const R = { psa_rolle: "Admin", food_rolle: "Admin", fk_rolle: "Admin", funk_rolle: "Admin", dienst_rolle: "Admin" };
  let ok = null, verweigert = null;
  await app.begin(async (tx) => {
    await tx`select set_config('app.kamerad_id','0',true)`; await tx`select set_config('app.app_rolle','Admin',true)`;
    const [k] = await tx.unsafe(q.sql, q.params);
    await tx`select core.set_kamerad_rollen(${k.id}::integer, ${JSON.stringify(R)}::jsonb)`;
    const [kam] = await tx`select * from core.kameraden where id = ${k.id}`;
    const [b] = await tx`insert into core.benutzer (benutzername, pin, rolle, kamerad_id, aktiv) values ('test-setup','x','Admin',${kam.id},true) returning id, token_version`;
    ok = kam.psa_rolle === "Admin" && kam.food_rolle === "Admin" && kam.fk_rolle === "Admin" && kam.funk_rolle === "Admin" && kam.dienst_rolle === "Admin" && b.token_version === 0;
    // Aus einem normalen Scope (psa_rolle statt app_rolle) darf dieselbe Folge nicht gehen
    await tx`select set_config('app.app_rolle','',true)`; await tx`select set_config('app.psa_rolle','Admin',true)`;
    verweigert = await tx.savepoint((sp) => sp`insert into core.benutzer (benutzername, pin, rolle, kamerad_id) values ('x2','x','Admin',${kam.id})`).then(() => "ok", (e) => e.code);
    throw new Error("rollback");
  }).catch((e) => { if (e.message !== "rollback") throw e; });
  check("Setup-Schritte im Admin-Scope: Kamerad, vier Rollen über die Funktion, Admin-Benutzer (tv 0)", ok === true);
  check("Mit psa_rolle Admin ohne app_rolle kein Benutzer-INSERT (42501)", verweigert === "42501", String(verweigert));
  check("Datenbank nach dem Rollback weiterhin leer", (await owner`select count(*)::int n from core.benutzer`)[0].n === 0);

  // ── Teil 2: HTTP gegen einen eigenen Dev-Server ──
  child = starteProzess(process.execPath, [`${P}/node_modules/next/dist/bin/next`, "dev", "--webpack", "-p", String(PORT)], { cwd: P, env, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (d) => (log += d)); child.stderr.on("data", (d) => (log += d));
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${BASE}/login`)).status === 200) break; } catch { /* startet noch */ } await new Promise((r) => setTimeout(r, 1000)); }
  check("Dev-Server auf 3101 bereit (kein weiterer next dev im Projekt aktiv)", !/Another next dev server/.test(log));
  const seite = async (p, c) => { const r = await fetch(`${BASE}${p}`, { headers: c ? { cookie: c } : {}, redirect: "manual" }); return { status: r.status, loc: r.headers.get("location") || "", html: await r.text() }; };
  const setup = async (body) => { const r = await fetch(`${BASE}/api/auth/setup`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); const text = await r.text(); return { status: r.status, cookie: (r.headers.get("set-cookie") || "").split(";")[0], text }; };

  let s = await seite("/");
  check("Leere DB: / → 307 /setup", s.status === 307 && s.loc.endsWith("/setup"), `${s.status} ${s.loc}`);
  s = await seite("/setup");
  check("/setup: 200, alle Felder, Umschalter, keine Kopfzeile", s.status === 200 && ["Vorname", "Name", "Benutzername", "PIN bestätigen"].every((t) => s.html.includes(t)) && s.html.includes("data-theme-toggle") && !/<header\b[^>]*data-app-header/.test(s.html), `${s.status}`);
  check("/setup: next-themes-Script im HTML", s.html.includes("prefers-color-scheme"));
  let r = await setup({ vorname: "Test", name: "Setup", benutzername: "test-setup", pin: "12345" });
  check("Setup mit PIN < 6 → 400", r.status === 400, `${r.status}`);
  r = await setup({ vorname: "Test", name: "Setup", benutzername: "test-setup", pin: "192837" });
  check("Setup → 200 mit Cookie, ohne Hash in der Antwort", r.status === 200 && r.cookie.startsWith("fw_jwt=") && !/\$2[aby]\$/.test(r.text), `${r.status}`);
  const c = JSON.parse(Buffer.from(r.cookie.split("=")[1].split(".")[1], "base64url").toString());
  check("Setup-JWT: app_rolle Admin, benutzer_id, tv 0, alle Modulrollen Admin", c.app_role === "Admin" && Number.isInteger(c.benutzer_id) && c.tv === 0 && c.psa_rolle === "Admin" && c.food_rolle === "Admin" && c.funk_rolle === "Admin" && c.dienst_rolle === "Admin");
  s = await seite("/", r.cookie);
  const k = [...s.html.matchAll(/data-kachel="([a-z]+)"/g)].map((m) => m[1]).sort();
  check("Nach Setup: / zeigt PSA, Küche, Funk, Dienstplan und Mitglieder", s.status === 200 && JSON.stringify(k) === JSON.stringify(["dienstplan", "food", "funk", "mitglieder", "psa"]), JSON.stringify(k));
  s = await seite("/setup");
  check("Nach Setup: /setup → 307 /login", s.status === 307 && s.loc.endsWith("/login"));
  const nochmal = await setup({ vorname: "X", name: "Y", benutzername: "test-setup2", pin: "192837" });
  check("Zweites Setup → 400 (bereits initialisiert)", nochmal.status === 400, `${nochmal.status}`);
  s = await seite("/");
  check("Nach Setup ohne Cookie: / → 307 /login", s.status === 307 && s.loc.endsWith("/login"));
  check("Die Kopie enthält genau einen Benutzer", (await owner`select count(*)::int n from core.benutzer`)[0].n === 1);
  check("Server-Log ohne Datenbank-URL", !log.includes(env.DATABASE_URL) && !log.includes(env.AUTH_DATABASE_URL));
} catch (e) {
  fail++; console.log("ABBRUCH:", e.message);
} finally {
  stop();
  await new Promise((res) => setTimeout(res, 1500));
  for (const c of [app, owner]) if (c) await c.end({ timeout: 5 }).catch(() => {});
  try {
    await adm.unsafe(`drop database if exists ${COPY_DB} with (force)`);
    const [{ n }] = await adm`select count(*)::int n from pg_database where datname = ${COPY_DB}`;
    check("Wegwerf-Datenbank gelöscht", n === 0);
  } catch (e) { console.log("AUFRÄUMEN FEHLGESCHLAGEN:", e.message); fail++; }
  await adm.end({ timeout: 5 });
}
console.log(fail === 0 ? "\nALLE TESTS OK" : `\n${fail} TEST(S) FEHLGESCHLAGEN`);
process.exit(fail ? 1 : 0);
