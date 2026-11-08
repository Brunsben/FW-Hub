// UI: Seitenrahmen, Kopfzeile, Umschalter und Seiten außerhalb des Rahmens.
// Aufruf:  node scripts/test-ui-a.mjs
// Env (aus .env.local, falls vorhanden): MIGRATE_DATABASE_URL (Owner), FWHUB_ADMIN_USER,
//   TEST_BASE (optional, Standard http://localhost:3100)
// Voraussetzung: lokaler Dev-Server (npx next dev --webpack -p 3100) auf derselben Datenbank.
// Geprüft: genau eine Kopfzeile vor <main> auf jeder Portalseite, Umschalter und genau ein
// Abmelden, aktiver Link, /login, /setup, Kiosk /food und /food/m/[token] ohne Kopfzeile,
// Weiterleitung ohne Cookie. Ein Test-Admin mit psa-/food-/funk-Rolle (Owner-Bootstrap),
// echte Login-Tokens; aufgeräumt wird über gemerkte IDs. Das Konto aus FWHUB_ADMIN_USER wird
// nur vorher/nachher verglichen. Bricht ab, wenn Datenbank oder Server nicht lokal sind.
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PROJECT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const BASE = process.env.TEST_BASE || "http://localhost:3100";
if (existsSync(`${PROJECT}/.env.local`)) process.loadEnvFile(`${PROJECT}/.env.local`);
const lokal = (h) => ["localhost", "127.0.0.1", "[::1]", "::1"].includes(h);
if (!process.env.MIGRATE_DATABASE_URL) { console.error("Abbruch: MIGRATE_DATABASE_URL ist nicht gesetzt."); process.exit(2); }
if (!lokal(new URL(process.env.MIGRATE_DATABASE_URL).hostname) || !lokal(new URL(BASE).hostname)) { console.error("Abbruch: Datenbank und Server müssen lokal sein."); process.exit(2); }
const req = createRequire(`${PROJECT}/package.json`);
const imp = async (m) => import(pathToFileURL(req.resolve(m)).href);
const bcrypt = (await imp("bcryptjs")).default;
const postgres = (await imp("postgres")).default;
const owner = postgres(process.env.MIGRATE_DATABASE_URL, { max: 1, onnotice: () => {} });

let failed = 0;
const check = (name, ok, info = "") => { if (!ok) failed++; console.log(`${ok ? "OK  " : "FAIL"} ${name}${info ? " — " + info : ""}`); };
const adminName = String(process.env.FWHUB_ADMIN_USER).toLowerCase();
const adminSnap = async () => JSON.stringify((await owner`
  select b.aktiv, b.rolle, b.token_version, md5(b.pin) p, b.updated_at::text bu,
         k.aktiv ka, k.psa_rolle, k.food_rolle, k.fk_rolle, k.funk_rolle, k.updated_at::text ku
  from core.benutzer b join core.kameraden k on k.id = b.kamerad_id where lower(b.benutzername) = ${adminName}`)[0]);
const vorher = await adminSnap();

const IP = { "x-real-ip": "10.91.0.1" };
const cookieOf = (r) => (r.headers.get("set-cookie") || "").split(";")[0];
const login = async (n, p) => { const r = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json", ...IP }, body: JSON.stringify({ benutzername: n, pin: p }) }); if (r.status !== 200) throw new Error(`Login → ${r.status}`); return cookieOf(r); };
const get = async (p, c) => { const r = await fetch(`${BASE}${p}`, { headers: c ? { cookie: c } : {}, redirect: "manual" }); return { status: r.status, loc: r.headers.get("location") || "", html: await r.text() }; };
const patch = async (p, c, b) => { const r = await fetch(`${BASE}${p}`, { method: "PATCH", headers: { "content-type": "application/json", ...IP, cookie: c }, body: JSON.stringify(b) }); return r.status; };
for (let i = 0; i < 90; i++) { try { const r = await fetch(`${BASE}/login`); if (r.status === 200) break; } catch {} await new Promise((r) => setTimeout(r, 1000)); }

const stamp = Date.now();
const ids = { kamerad: null, benutzer: null, name: null };
try {
  const A = `testui-admin-${stamp}`, AP = "919191";
  const [k] = await owner`insert into core.kameraden (name, vorname) values (${"T9UI" + stamp}, 'U') returning id`;
  ids.kamerad = k.id;
  const [b] = await owner`insert into core.benutzer (benutzername, pin, rolle, kamerad_id) values (${A}, ${await bcrypt.hash(AP, 12)}, 'Admin', ${k.id}) returning id`;
  ids.benutzer = b.id; ids.name = A;
  let c = await login(A, AP);
  const st = await patch(`/api/admin/rollen/${k.id}`, c, { psaRolle: "Admin", foodRolle: "Admin", funkRolle: "Admin" });
  c = await login(A, AP); // neue Claims
  check("Setup: Test-Admin mit psa-/food-/funk-Rolle", st === 200);

  // ── Portalseiten ──
  const seiten = [
    ["/", "/"], ["/psa", "/psa"], ["/psa/verlauf", "/psa"], ["/funk", "/funk"],
    ["/food/admin", "/food/admin"], ["/food/admin/heute", "/food/admin"],
    ["/mitglieder", "/mitglieder"], ["/profil", "/profil"],
  ];
  for (const [pfad, aktivHref] of seiten) {
    const p = await get(pfad, c);
    const h = p.html;
    const headerRe = /<header[^>]*data-app-header/g;
    const anzahl = (h.match(headerRe) || []).length;
    const iHeader = h.search(/<header[^>]*data-app-header/);
    const iMain = h.indexOf("<main");
    const iKachel = h.indexOf("data-kachel");
    const kopf = h.slice(iHeader, h.indexOf("</header>", iHeader));
    const aktive = [...kopf.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]).filter((a) => /aria-current="page"/.test(a)).map((a) => (a.match(/href="([^"]+)"/) || [])[1]);
    const reihenfolge = iHeader > -1 && iMain > -1 && iHeader < iMain && (iKachel === -1 || iHeader < iKachel);
    check(`${pfad}: 200, genau eine Kopfzeile, vor <main>${pfad === "/" ? " und vor den Kacheln" : ""}`, p.status === 200 && anzahl === 1 && reihenfolge, `Status ${p.status}, Header@${iHeader} main@${iMain}${pfad === "/" ? ` kachel@${iKachel}` : ""}`);
    check(`${pfad}: Umschalter + genau ein Abmelden in der Kopfzeile`, kopf.includes("data-theme-toggle") && (kopf.match(/>Abmelden</g) || []).length === 1 && (h.match(/>Abmelden</g) || []).length === 1);
    check(`${pfad}: aktiver Link ${aktivHref} (aria-current)`, aktive.length === 1 && aktive[0] === aktivHref, JSON.stringify(aktive));
  }
  const home = await get("/", c);
  check("/: next-themes-Script im HTML (System-Erkennung)", home.html.includes("prefers-color-scheme"));
  check("/: Kopfzeile sticky (Klasse)", /data-app-header[^>]*sticky|sticky[^>]*data-app-header/.test(home.html) || /<header[^>]*sticky[^>]*>/.test(home.html));
  const hinweis = await get("/?kein_zugriff=funk", c);
  check("/?kein_zugriff=funk: Hinweis mit Warn-Token statt amber", hinweis.html.includes("border-warning/50") && !hinweis.html.includes("amber-"));

  // ── Seiten außerhalb des Rahmens ──
  const login_ = await get("/login");
  check("/login: 200, Umschalter, keine Kopfzeile", login_.status === 200 && login_.html.includes("data-theme-toggle") && !login_.html.includes("data-app-header"));
  const setup = await get("/setup");
  check("/setup (mit vorhandenen Benutzern): 307 /login", setup.status === 307 && setup.loc.endsWith("/login"));
  const kiosk = await get("/food");
  check("/food (Kiosk): 200, keine Kopfzeile, kein Umschalter", kiosk.status === 200 && !kiosk.html.includes("data-app-header") && !kiosk.html.includes("data-theme-toggle"));
  const mobil = await get("/food/m/ungueltig-test-token");
  check("/food/m/[token]: keine Kopfzeile, kein Umschalter", !mobil.html.includes("data-app-header") && !mobil.html.includes("data-theme-toggle"), `Status ${mobil.status}`);

  // ── Ohne Cookie ──
  for (const [pfad] of seiten) {
    const r = await get(pfad);
    check(`${pfad} ohne Cookie → 307 /login`, r.status === 307 && r.loc.endsWith("/login"), `${r.status} ${r.loc}`);
  }
} finally {
  // Aufräumen nur über gemerkte IDs / exakten Namen
  if (ids.name) await owner`delete from core.login_attempts where benutzername = ${ids.name.toLowerCase()}`;
  if (ids.kamerad) await owner`delete from core.mitglieder_audit where kamerad_id = ${ids.kamerad}`;
  if (ids.benutzer) await owner`delete from core.benutzer where id = ${ids.benutzer}`;
  if (ids.kamerad) await owner`delete from core.kameraden where id = ${ids.kamerad}`;
  const [{ n }] = await owner`select count(*)::int n from core.kameraden where id = ${ids.kamerad ?? 0}`;
  check("Aufräumen über gemerkte IDs (Testbenutzer und -kamerad gelöscht)", n === 0);
  check("Admin-Konto vorher = nachher", vorher === (await adminSnap()));
  console.log("Gemerkte IDs:", JSON.stringify({ kamerad: ids.kamerad, benutzer: ids.benutzer }));
  await owner.end();
  console.log(failed ? `\n${failed} TEST(S) FEHLGESCHLAGEN` : "\nALLE TESTS OK");
  process.exit(failed ? 1 : 0);
}
