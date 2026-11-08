// Login-Sperre (src/lib/login-throttle.ts): Name+IP, Name allein, IP, IPv6-/64,
// interne Adressen und Header-Fallback. Läuft gegen den lokalen Dev-Server.
//
// Aufruf:  node scripts/test-login-sperre.mjs
// Env wie bei scripts/test-haertung.mjs (aus .env.local, falls vorhanden):
//   MIGRATE_DATABASE_URL  Owner: Testdaten anlegen, kontrollieren, aufräumen
//   TEST_BASE             optional, Standard http://localhost:3100
// Voraussetzung: lokaler Dev-Server (npx next dev --webpack -p 3100) auf derselben
// Datenbank. Dauer rund eine Minute (jeder Versuch rechnet bcrypt).
//
// Die Client-IP kommt im Test über den Header X-Real-IP, so wie nginx sie setzt.
// Als Adressen dienen Dokumentationsbereiche (203.0.113.0/24, 198.51.100.0/24,
// 2001:db8::/32), die die App als öffentlich behandelt. Aufgeräumt wird über
// gemerkte IDs und exakte Benutzernamen. Bricht ab, wenn Datenbank oder Server
// nicht lokal sind. Secrets werden nie ausgegeben.
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

const stamp = `sp${Date.now().toString(36)}`;
const PIN = "121212", FALSCH = "999999";
let fail = 0;
const check = (n, c, i = "") => { if (!c) fail++; console.log(`${c ? "OK  " : "FEHLER"} ${n}${i ? " — " + i : ""}`); };
const ids = { kam: [], ben: [] }, namen = [];
const hash = await bcrypt.hash(PIN, 12);

async function mk(suffix) {
  const name = `${stamp}-${suffix}`; namen.push(name);
  const [k] = await owner`insert into core.kameraden (name, vorname, aktiv) values (${name}, 'Sp', true) returning id`;
  ids.kam.push(k.id);
  const [b] = await owner`insert into core.benutzer (benutzername, pin, rolle, kamerad_id, aktiv) values (${name}, ${hash}, 'User', ${k.id}, true) returning id`;
  ids.ben.push(b.id);
  return name;
}
// Header als Objekt; ip = null sendet keinen X-Real-IP
async function login(name, pin, ip, extra = {}) {
  const headers = { "content-type": "application/json", ...(ip ? { "x-real-ip": ip } : {}), ...extra };
  const r = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers, body: JSON.stringify({ benutzername: name, pin }) });
  const json = await r.json().catch(() => ({}));
  return { status: r.status, retry: json.retryAfterSec };
}
const fehlversuche = async (name, pin, ips) => { const s = []; for (const ip of ips) s.push((await login(name, pin, ip)).status); return s; };
const alle = (arr, wert) => arr.every((s) => s === wert);
const gespeicherteIps = async (name) => (await owner`select ip from core.login_attempts where benutzername = ${name.toLowerCase()} order by id`).map((r) => r.ip);

try {
  // ── 1. Name + IP ────────────────────────────────────────────────────────────
  const u1 = await mk("u1");
  const A = "203.0.113.10", B = "203.0.113.11";
  let s = await fehlversuche(u1, FALSCH, Array(5).fill(A));
  check("Name+IP: 5 Fehlversuche von IP A → je 401", alle(s, 401), String(s));
  let r = await login(u1, FALSCH, A);
  check("Name+IP: 6. Versuch von IP A → 429 mit Retry-Zeit", r.status === 429 && r.retry > 0, `${r.status} ${r.retry}s`);
  r = await login(u1, PIN, A);
  check("Name+IP: richtige PIN von IP A während der Sperre → 429", r.status === 429);
  r = await login(u1, PIN, B);
  check("Name+IP: derselbe Name von IP B ist NICHT gesperrt (richtige PIN → 200)", r.status === 200, String(r.status));
  r = await login(u1, PIN, A);
  check("Name+IP: Erfolg von IP B setzt die Sperre von IP A nicht zurück (429)", r.status === 429);

  // ── 2. Erfolg setzt den Zähler derselben Name+IP zurück ────────────────────
  const u2 = await mk("u2");
  const C = "203.0.113.20";
  s = await fehlversuche(u2, FALSCH, Array(4).fill(C));
  r = await login(u2, PIN, C);
  check("Zähler: 4 Fehlversuche, dann Erfolg von derselben IP → 200", alle(s, 401) && r.status === 200);
  s = await fehlversuche(u2, FALSCH, Array(5).fill(C));
  check("Zähler: nach dem Erfolg wieder 5 Fehlversuche frei (ohne Rücksetzen wäre schon gesperrt)", alle(s, 401), String(s));
  r = await login(u2, FALSCH, C);
  check("Zähler: danach 6. Versuch → 429", r.status === 429);

  // ── 3. Name allein: 50 Fehlversuche von 50 verschiedenen IPs ───────────────
  const u3 = await mk("u3");
  const viele = Array.from({ length: 50 }, (_, i) => `198.51.100.${i + 1}`);
  s = await fehlversuche(u3, FALSCH, viele);
  check("Name allein: 50 Fehlversuche von 50 IPs → je 401 (keine Name+IP-Sperre)", alle(s, 401), `${s.filter((x) => x === 401).length}x 401`);
  r = await login(u3, PIN, "198.51.100.200");
  check("Name allein: 51. Versuch von einer frischen IP (richtige PIN) → 429", r.status === 429, String(r.status));

  // ── 4. IP-Sperre: 30 Fehlversuche über verschiedene Namen ──────────────────
  const D = "203.0.113.30";
  const fremdeNamen = Array.from({ length: 30 }, (_, i) => { const n = `${stamp}-ip${i}`; namen.push(n); return n; });
  s = [];
  for (const n of fremdeNamen) s.push((await login(n, FALSCH, D)).status);
  check("IP: 30 Fehlversuche von IP D mit 30 Namen → je 401", alle(s, 401), `${s.filter((x) => x === 401).length}x 401`);
  const u4 = await mk("u4");
  r = await login(u4, PIN, D);
  check("IP: 31. Versuch von IP D (anderer Name, richtige PIN) → 429", r.status === 429, String(r.status));
  r = await login(u4, PIN, "203.0.113.31");
  check("IP: von einer anderen IP geht derselbe Name (200)", r.status === 200, String(r.status));

  // ── 5. IPv6: Zählung pro /64, Speicherung der vollen Adresse ───────────────
  const v1 = await mk("v1");
  const v6 = ["2001:db8:aaaa:bbbb::1", "2001:db8:aaaa:bbbb::1", "2001:db8:aaaa:bbbb:1:2:3:4", "2001:DB8:AAAA:BBBB:1:2:3:4", "2001:db8:aaaa:bbbb:ffff::9"];
  s = await fehlversuche(v1, FALSCH, v6);
  check("IPv6: 5 Fehlversuche von 3 Adressen im selben /64 → je 401", alle(s, 401), String(s));
  r = await login(v1, FALSCH, "2001:db8:aaaa:bbbb::beef");
  check("IPv6: 6. Versuch von einer weiteren Adresse im selben /64 → 429", r.status === 429, String(r.status));
  r = await login(v1, PIN, "2001:db8:aaaa:bbbc::1");
  check("IPv6: anderes /64 ist nicht gesperrt (200)", r.status === 200, String(r.status));
  const gesp = await gespeicherteIps(v1);
  check("IPv6: gespeichert wird die volle Adresse in kanonischer Form", gesp[0] === "2001:0db8:aaaa:bbbb:0000:0000:0000:0001" && gesp[2] === "2001:0db8:aaaa:bbbb:0001:0002:0003:0004", gesp.slice(0, 4).join(" | "));

  // ── 6. IPv6-IP-Sperre pro /64 über verschiedene Namen ───────────────────────
  const E6 = "2001:db8:cccc:dddd";
  s = [];
  for (let i = 0; i < 30; i++) { const n = `${stamp}-v6ip${i}`; namen.push(n); s.push((await login(n, FALSCH, `${E6}::${(i + 1).toString(16)}`)).status); }
  check("IPv6-IP: 30 Fehlversuche aus einem /64 mit 30 Adressen und Namen → je 401", alle(s, 401));
  const u6 = await mk("u6");
  r = await login(u6, PIN, `${E6}:1:2:3:4`);
  check("IPv6-IP: 31. Versuch aus demselben /64 → 429", r.status === 429, String(r.status));

  // ── 7. Interne Adressen und Müll gelten als "unbekannt" ─────────────────────
  const u7 = await mk("u7");
  const intern = ["172.18.0.1", "10.1.2.3", "127.0.0.1", "192.168.0.7", "fd00::1"];
  s = await fehlversuche(u7, FALSCH, intern);
  const ips7 = await gespeicherteIps(u7);
  check("Intern: private/Loopback/Docker/ULA-Adressen werden als 'unbekannt' gespeichert", ips7.length === 5 && ips7.every((x) => x === "unbekannt"), ips7.join(","));
  r = await login(u7, FALSCH, "172.18.0.1");
  check("Intern: 6. Versuch → 429 (Zähler 'unbekannt' wirkt wie eine Sperre pro Name)", r.status === 429, String(r.status));
  r = await login(u7, PIN, "abc");
  check("Intern: ungültiger Header-Wert zählt ebenfalls als 'unbekannt' (429)", r.status === 429);
  const u7b = await mk("u7b");
  s = [];
  for (let i = 0; i < 31; i++) { const n = `${stamp}-int${i}`; namen.push(n); s.push((await login(n, FALSCH, "172.18.0.1")).status); }
  check("Intern: 31 Fehlversuche von 172.18.0.1 lösen KEINE IP-Sperre aus (je 401)", alle(s, 401), `${s.filter((x) => x === 401).length}x 401`);
  r = await login(u7b, PIN, "172.18.0.1");
  check("Intern: danach kann sich ein anderer Nutzer von 172.18.0.1 anmelden (200)", r.status === 200, String(r.status));

  // ── 8. Header-Fallback ──────────────────────────────────────────────────────
  const u8 = await mk("u8");
  await login(u8, FALSCH, null, { "x-forwarded-for": "198.18.0.5, 8.8.8.8, 203.0.113.99" });
  const ips8 = await gespeicherteIps(u8);
  check("Fallback: ohne X-Real-IP zählt der LETZTE Eintrag von X-Forwarded-For", ips8[0] === "203.0.113.99", ips8.join(","));
  await login(u8, FALSCH, "203.0.113.50", { "x-forwarded-for": "8.8.8.8" });
  const ips8b = await gespeicherteIps(u8);
  check("X-Real-IP hat Vorrang vor X-Forwarded-For", ips8b[1] === "203.0.113.50", ips8b.join(","));
} finally {
  // Aufräumen nur über gemerkte IDs und exakte Benutzernamen
  try {
    if (namen.length) await owner`delete from core.login_attempts where benutzername in ${owner(namen.map((n) => n.toLowerCase()))}`;
    if (ids.ben.length) await owner`delete from core.benutzer where id in ${owner(ids.ben)}`;
    if (ids.kam.length) await owner`delete from core.mitglieder_audit where kamerad_id in ${owner(ids.kam)}`;
    if (ids.kam.length) await owner`delete from core.kameraden where id in ${owner(ids.kam)}`;
    const [{ n }] = await owner`select count(*)::int n from core.kameraden where name like ${stamp + "-%"}`;
    console.log(`Aufräumen: ${ids.ben.length} Benutzer, ${ids.kam.length} Kameraden, ${namen.length} Namen; Rest mit Zeitstempel ${stamp}: ${n}`);
  } catch (e) { console.log("AUFRÄUMEN FEHLGESCHLAGEN:", e.message, JSON.stringify({ ids, namen })); fail++; }
  await owner.end({ timeout: 5 });
}
console.log(fail === 0 ? "\nALLE TESTS OK" : `\n${fail} TEST(S) FEHLGESCHLAGEN`);
process.exit(fail ? 1 : 0);
