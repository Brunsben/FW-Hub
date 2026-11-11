// Zugriffsschutz aller Routen unter /api/dienstplan.
//
// Es gibt keine globale Auth-Middleware: Jede Route prüft selbst. Dieser Test
// findet alle route.ts unter src/app/api/dienstplan und ruft jede exportierte
// Methode ohne Anmeldung und mit kaputtem Cookie auf. Erwartet wird 401.
// Ausnahmen sind nur die Token-Routen (Präsentation, iCal) in TOKEN_ROUTEN:
// Sie müssen ohne Token und mit falschem Token 401 oder 403 liefern (das
// iCal-Abo 404). Eine Route,
// die in keiner der beiden Gruppen sauber prüfbar ist, lässt den Test scheitern.
// Zusätzlich: Eine angemeldete Person ohne dienst_rolle (= Mitglied) erreicht
// die Lese-Route der Kategorien (Durchstich Session → Scope → RLS).
//
// Aufruf:  node scripts/test-dienstplan-auth.mjs
// Voraussetzung: Dev-Server (npx next dev --webpack -p 3100) mit derselben Datenbank.
// Env (aus .env.local): MIGRATE_DATABASE_URL (Owner, nur Testkonto anlegen/aufräumen),
//   TEST_BASE optional, Standard http://localhost:3100
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { join, relative, resolve, sep } from "node:path";
import { schutz } from "./lib/schutz.mjs";

const P = resolve(fileURLToPath(new URL("..", import.meta.url)));
if (existsSync(`${P}/.env.local`)) process.loadEnvFile(`${P}/.env.local`);
const BASE = process.env.TEST_BASE || "http://localhost:3100";
schutz({ db: ["MIGRATE_DATABASE_URL"], base: BASE });
const req = createRequire(`${P}/package.json`);
const postgres = (await import(pathToFileURL(req.resolve("postgres")).href)).default;
const bcrypt = (await import(pathToFileURL(req.resolve("bcryptjs")).href)).default;
const owner = postgres(process.env.MIGRATE_DATABASE_URL, { max: 1, onnotice: () => {} });

// Token-Routen: Pfad relativ zu /api/dienstplan im Dateisystem-Format (mit [param]).
// aufrufe(): Aufrufe ohne Token und mit falschem Token ({ url, headers }).
// Ein Eintrag ohne passende route.ts ist ein Fehler. Ausführlich (abgelaufen,
// anderer Plan, beendet) in test-dienstplan-anzeige.mjs.
const FALSCHES_TOKEN = "A".repeat(43); // richtiges Format, gibt es nicht
const TOKEN_ROUTEN = [
  { pfad: "anzeige/[jahr]", methode: "GET", aufrufe: () => ({
    ohne: { url: "/api/dienstplan/anzeige/2026" },
    falsch: { url: "/api/dienstplan/anzeige/2026", headers: { "x-dienstplan-anzeige": FALSCHES_TOKEN } },
  }) },
  // iCal-Abo (Phase 10): Token im Pfad, unbekannt oder falsch → 404 ohne Unterscheidung
  { pfad: "abo/[token]", methode: "GET", erwartet: [404], aufrufe: () => ({
    ohne: { url: "/api/dienstplan/abo/kein-token.ics" },
    falsch: { url: `/api/dienstplan/abo/${FALSCHES_TOKEN}.ics` },
  }) },
];

const METHODEN = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const WURZEL = join(P, "src", "app", "api", "dienstplan");

let fail = 0, ok = 0;
const check = (name, cond, extra = "") => {
  if (cond) { ok++; console.log(`OK   ${name}${extra ? " — " + extra : ""}`); }
  else { fail++; console.log(`FEHLER ${name}${extra ? " — " + extra : ""}`); }
};

function routenDateien(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...routenDateien(p));
    else if (/^route\.(ts|tsx|js|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

function methodenIn(datei) {
  const src = readFileSync(datei, "utf8");
  return METHODEN.filter((m) =>
    new RegExp(`export\\s+(async\\s+)?function\\s+${m}\\b|export\\s+const\\s+${m}\\b|export\\s*\\{[^}]*\\b${m}\\b[^}]*\\}`).test(src));
}

// Dateisystem-Pfad → URL: Route-Gruppen (x) entfallen, [param] und [...param] werden "1".
function urlFuer(pfadRel) {
  const teile = pfadRel.split("/").filter((t) => t && !/^\(.*\)$/.test(t)).map((t) => (/^\[.*\]$/.test(t) ? "1" : t));
  return `/api/dienstplan${teile.length ? "/" + teile.join("/") : ""}`;
}

async function aufruf(methode, url, cookie, extra = {}) {
  const r = await fetch(`${BASE}${url}`, {
    method: methode,
    redirect: "manual",
    headers: {
      ...extra,
      ...(cookie ? { cookie } : {}),
      ...(methode !== "GET" ? { "content-type": "application/json" } : {}),
    },
    body: methode !== "GET" ? "{}" : undefined,
  });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* keine JSON-Antwort */ }
  return { status: r.status, json };
}

const ids = { kam: [], ben: [] };
try {
  const dateien = routenDateien(WURZEL);
  check("Routen unter src/app/api/dienstplan gefunden", dateien.length > 0, `${dateien.length} Datei(en)`);
  const gefunden = [];
  for (const datei of dateien) {
    const pfadRel = relative(WURZEL, datei).split(sep).slice(0, -1).join("/");
    for (const methode of methodenIn(datei)) gefunden.push({ pfadRel, methode });
  }
  check("Jede gefundene route.ts exportiert mindestens eine Methode",
    dateien.every((d) => methodenIn(d).length > 0), dateien.filter((d) => methodenIn(d).length === 0).map((d) => relative(P, d)).join(", "));

  for (const t of TOKEN_ROUTEN) {
    check(`Token-Route ${t.methode} ${t.pfad} existiert`, gefunden.some((g) => g.pfadRel === t.pfad && g.methode === t.methode));
  }

  for (const { pfadRel, methode } of gefunden) {
    const token = TOKEN_ROUTEN.find((t) => t.pfad === pfadRel && t.methode === methode);
    if (token) {
      const { ohne, falsch } = token.aufrufe();
      for (const [art, a] of [["ohne Token", ohne], ["mit falschem Token", falsch]]) {
        if (!a) continue;
        const r = await aufruf(methode, a.url, null, a.headers);
        const erwartet = token.erwartet ?? [401, 403];
        check(`${methode} ${a.url} ${art} → ${erwartet.join("/")}`, erwartet.includes(r.status), String(r.status));
      }
      continue;
    }
    const url = urlFuer(pfadRel);
    const ohne = await aufruf(methode, url, null);
    check(`${methode} ${url} ohne Anmeldung → 401`, ohne.status === 401, String(ohne.status));
    const kaputt = await aufruf(methode, url, "fw_jwt=kein.gueltiges.token");
    check(`${methode} ${url} mit ungültigem Cookie → 401`, kaputt.status === 401, String(kaputt.status));
  }

  // ── Durchstich: angemeldet ohne dienst_rolle = Mitglied ────────────────────
  const stamp = `dpa${Date.now().toString(36)}`;
  const PIN = "dp-test-" + stamp;
  const [k] = await owner`insert into core.kameraden (name, vorname) values (${stamp}, 'Dp') returning id`;
  ids.kam.push(k.id);
  const [b] = await owner`insert into core.benutzer (benutzername, pin, rolle, kamerad_id) values (${stamp}, ${await bcrypt.hash(PIN, 12)}, 'User', ${k.id}) returning id`;
  ids.ben.push(b.id);
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": "203.0.113.77" },
    body: JSON.stringify({ benutzername: stamp, pin: PIN }),
  });
  check("Anmeldung des Testkontos", login.status === 200, String(login.status));
  const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
  const claims = JSON.parse(Buffer.from(cookie.split("=")[1].split(".")[1], "base64url").toString());
  check("JWT trägt dienst_rolle (hier leer = Mitglied)", "dienst_rolle" in claims && claims.dienst_rolle === null, JSON.stringify(claims.dienst_rolle));
  const r = await aufruf("GET", "/api/dienstplan/kategorien", cookie);
  check("Mitglied liest Kategorien (200, 7 Seeds)", r.status === 200 && r.json?.kategorien?.length === 7 && r.json.kategorien[0].kuerzel === "D", `${r.status} ${r.json?.kategorien?.length}`);

  // ── Rolle vergeben: nur globaler Admin, Werte geprüft, neuer Login trägt den Claim ──
  const anmelden = async (name, pin, ip) => {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": ip },
      body: JSON.stringify({ benutzername: name, pin }),
    });
    return (res.headers.get("set-cookie") || "").split(";")[0];
  };
  const claimsAus = (c) => JSON.parse(Buffer.from(c.split("=")[1].split(".")[1], "base64url").toString());
  const [ka] = await owner`insert into core.kameraden (name, vorname) values (${stamp + "-adm"}, 'Dp') returning id`;
  ids.kam.push(ka.id);
  const [ba] = await owner`insert into core.benutzer (benutzername, pin, rolle, kamerad_id) values (${stamp + "-adm"}, ${await bcrypt.hash(PIN, 12)}, 'Admin', ${ka.id}) returning id`;
  ids.ben.push(ba.id);
  const admCookie = await anmelden(`${stamp}-adm`, PIN, "203.0.113.78");
  let rr = await aufruf("PATCH", `/api/admin/rollen/${k.id}`, cookie);
  check("Rolle vergeben als Nicht-Admin → 403", rr.status === 403, String(rr.status));
  rr = await fetch(`${BASE}/api/admin/rollen/${k.id}`, { method: "PATCH", headers: { cookie: admCookie, "content-type": "application/json" }, body: JSON.stringify({ dienstRolle: "Chef" }) });
  check("Unbekannte Dienstplan-Rolle → 400", rr.status === 400, String(rr.status));
  rr = await fetch(`${BASE}/api/admin/rollen/${k.id}`, { method: "PATCH", headers: { cookie: admCookie, "content-type": "application/json" }, body: JSON.stringify({ dienstRolle: "Planer" }) });
  const rj = await rr.json();
  check("Admin vergibt Rolle Planer → 200, Antwort enthält dienstRolle", rr.status === 200 && rj.kamerad?.dienstRolle === "Planer", `${rr.status} ${JSON.stringify(rj.kamerad)}`);
  const alt = await aufruf("GET", "/api/dienstplan/kategorien", cookie);
  check("Alte Sitzung ist nach der Rollenänderung ungültig (401)", alt.status === 401, String(alt.status));
  const neu = await anmelden(stamp, PIN, "203.0.113.79");
  check("Neuer Login trägt dienst_rolle Planer", claimsAus(neu).dienst_rolle === "Planer", JSON.stringify(claimsAus(neu).dienst_rolle));
} finally {
  try {
    if (ids.ben.length) await owner`delete from core.benutzer where id in ${owner(ids.ben)}`;
    if (ids.kam.length) await owner`delete from core.mitglieder_audit where kamerad_id in ${owner(ids.kam)}`;
    if (ids.kam.length) await owner`delete from core.kameraden where id in ${owner(ids.kam)}`;
    await owner`delete from core.login_attempts where benutzername like 'dpa%'`;
  } catch (e) { console.log("AUFRÄUMEN FEHLGESCHLAGEN:", e.message); fail++; }
  await owner.end({ timeout: 5 });
}
console.log(`\n${ok} OK, ${fail} Fehler`);
process.exit(fail ? 1 : 0);
