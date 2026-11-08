// Login-Meldung bei deaktiviertem Konto (Route /api/auth/login).
//
// Aufruf:  node scripts/test-login-deaktiviert.mjs
// Voraussetzung: lokaler Dev-Server (npx next dev --webpack -p 3100; anderer Port
// über TEST_BASE) und MIGRATE_DATABASE_URL in .env.local (Owner, nur lokal).
//
// Geprüft wird: 403 mit Hinweis nur bei richtiger PIN, sonst die allgemeine 401-
// Meldung; deaktivierter Benutzer, deaktivierter Kamerad und beides zusammen;
// login_attempts und Sperre zählen gleich; die Laufzeit der Pfade ist gleich.
// Der Test legt eigene Konten an (Namen mit Zeitstempel-Präfix) und räumt sie
// ausschließlich über gemerkte IDs, exakte Namen und exakte IPs wieder auf.
// Er bricht ab, wenn Datenbank oder Server nicht lokal sind. Secrets werden
// nie ausgegeben.
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const P = fileURLToPath(new URL("..", import.meta.url)).replace(/[\/]$/, "");
process.loadEnvFile(`${P}/.env.local`);
const req = createRequire(`${P}/package.json`);
const imp = async (m) => import(pathToFileURL(req.resolve(m)).href);
const postgres = (await imp("postgres")).default;
const bcrypt = (await imp("bcryptjs")).default;
const BASE = process.env.TEST_BASE || "http://localhost:3100";

// Schutz: Dieser Test legt Konten an. Nur gegen lokale Datenbank und lokalen Server.
const lokal = (h) => ["localhost", "127.0.0.1", "[::1]", "::1"].includes(h);
if (!lokal(new URL(process.env.MIGRATE_DATABASE_URL).hostname) || !lokal(new URL(BASE).hostname)) {
  console.error("Abbruch: Datenbank und Server müssen lokal sein (localhost / 127.0.0.1).");
  process.exit(2);
}
const owner = postgres(process.env.MIGRATE_DATABASE_URL, { max: 1, onnotice: () => {} });

const stamp = `lg${Date.now().toString(36)}`;
const PIN = "121212", FALSCH = "999999";
const GENERISCH = "Benutzername oder PIN falsch";
const DEAKTIVIERT = "Dein Konto ist deaktiviert. Bitte wende dich an die Wehrführung.";
let fail = 0;
const check = (n, c, i = "") => { if (!c) fail++; console.log(`${c ? "OK  " : "FEHLER"} ${n}${i ? " — " + i : ""}`); };
const ids = { kam: [], ben: [] }, namen = [], ips = [];
let ipZaehler = 0;
const neueIp = () => { const ip = `10.88.${Math.floor(Math.random() * 200) + 1}.${++ipZaehler}`; ips.push(ip); return ip; };
const hash = await bcrypt.hash(PIN, 12);

async function mk(suffix, { benutzerAktiv = true, kameradAktiv = true } = {}) {
  const [k] = await owner`insert into core.kameraden (name, vorname, aktiv) values (${`${stamp}-${suffix}`}, 'Lg', ${kameradAktiv}) returning id`;
  ids.kam.push(k.id);
  const name = `${stamp}-${suffix}`; namen.push(name);
  const [b] = await owner`insert into core.benutzer (benutzername, pin, rolle, kamerad_id, aktiv) values (${name}, ${hash}, 'User', ${k.id}, ${benutzerAktiv}) returning id`;
  ids.ben.push(b.id);
  return { name, kamerad: k.id, benutzer: b.id };
}
async function login(name, pin, ip = neueIp()) {
  const t0 = performance.now();
  const r = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json", "x-real-ip": ip }, body: JSON.stringify({ benutzername: name, pin }) });
  const ms = performance.now() - t0;
  const json = await r.json().catch(() => ({}));
  return { status: r.status, error: json.error, cookie: r.headers.get("set-cookie") || "", ms, retry: r.headers.get("retry-after") };
}
const versuche = async (name) => await owner`select erfolgreich from core.login_attempts where benutzername = ${name.toLowerCase()} order by id`;
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

try {
  const A = await mk("a");                                        // aktiv
  const B = await mk("b", { benutzerAktiv: false });              // Benutzer deaktiviert, Kamerad aktiv
  const C = await mk("c");                                        // Kamerad deaktiviert, Benutzer (absichtlich) aktiv
  await owner`update core.kameraden set aktiv = false where id = ${C.kamerad}`;   // Trigger deaktiviert den Benutzer ...
  await owner`update core.benutzer set aktiv = true where id = ${C.benutzer}`;    // ... Test setzt ihn zurück (Absicherung im Login)
  const D = await mk("d");                                        // reguläre Deaktivierung: Kamerad inaktiv, Trigger deaktiviert Benutzer
  await owner`update core.kameraden set aktiv = false where id = ${D.kamerad}`;
  const dZustand = (await owner`select aktiv from core.benutzer where id = ${D.benutzer}`)[0].aktiv;
  check("Setup: Trigger hat Benutzer D deaktiviert", dZustand === false);
  const cZustand = (await owner`select b.aktiv ba, k.aktiv ka from core.benutzer b join core.kameraden k on k.id = b.kamerad_id where b.id = ${C.benutzer}`)[0];
  check("Setup: C = Benutzer aktiv, Kamerad inaktiv", cZustand.ba === true && cZustand.ka === false);

  // ── Antworten
  let r = await login(A.name, PIN);
  check("aktiv + richtige PIN → 200 mit Cookie", r.status === 200 && r.cookie.includes("fw_jwt="), String(r.status));
  r = await login(A.name, FALSCH);
  check("aktiv + falsche PIN → 401 allgemeine Meldung", r.status === 401 && r.error === GENERISCH, `${r.status} ${r.error}`);
  r = await login(`${stamp}-gibtsnicht`, PIN);
  check("unbekannter Name → 401 allgemeine Meldung", r.status === 401 && r.error === GENERISCH, `${r.status}`);
  for (const [bez, U] of [["Benutzer deaktiviert", B], ["Kamerad deaktiviert (Benutzer aktiv)", C], ["Kamerad + Benutzer deaktiviert (Trigger)", D]]) {
    r = await login(U.name, PIN);
    check(`${bez} + richtige PIN → 403 mit Hinweis, ohne Cookie`, r.status === 403 && r.error === DEAKTIVIERT && !r.cookie.includes("fw_jwt="), `${r.status} ${r.error}`);
    r = await login(U.name, FALSCH);
    check(`${bez} + falsche PIN → 401 allgemeine Meldung`, r.status === 401 && r.error === GENERISCH, `${r.status} ${r.error}`);
  }
  r = await login(B.name.toUpperCase(), PIN);
  check("Groß-/Kleinschreibung des Namens egal (403)", r.status === 403, String(r.status));

  // ── login_attempts: deaktiviert + richtige PIN zählt wie ein Fehlversuch
  const vA = await versuche(A.name), vB = await versuche(B.name), vC = await versuche(C.name), vD = await versuche(D.name);
  check("login_attempts A: Erfolg + Fehlversuch", vA.length === 2 && vA[0].erfolgreich === true && vA[1].erfolgreich === false);
  check("login_attempts B (Benutzer inaktiv): richtige PIN UND falsche PIN je als Fehlversuch", vB.length === 3 && vB.every((x) => x.erfolgreich === false), JSON.stringify(vB.map((x) => x.erfolgreich)));
  check("login_attempts C (Kamerad inaktiv): beides Fehlversuch", vC.length === 2 && vC.every((x) => x.erfolgreich === false));
  check("login_attempts D: beides Fehlversuch", vD.length === 2 && vD.every((x) => x.erfolgreich === false));

  // ── Sperre zählt gleich: 5 x deaktiviert+richtige PIN ⇒ 6. = 429, wie 5 x falsche PIN
  const E = await mk("e", { benutzerAktiv: false }), F = await mk("f");
  const ipE = neueIp(), ipF = neueIp();
  const eStat = [], fStat = [];
  for (let i = 0; i < 5; i++) eStat.push((await login(E.name, PIN, ipE)).status);
  const e6 = await login(E.name, PIN, ipE);
  for (let i = 0; i < 5; i++) fStat.push((await login(F.name, FALSCH, ipF)).status);
  const f6 = await login(F.name, FALSCH, ipF);
  check("deaktiviert + richtige PIN: 5x 403, 6. Versuch gesperrt (429)", eStat.every((s) => s === 403) && e6.status === 429, `${eStat} / ${e6.status}`);
  check("falsche PIN: 5x 401, 6. Versuch gesperrt (429), identisch", fStat.every((s) => s === 401) && f6.status === 429, `${fStat} / ${f6.status}`);
  const g = await login(F.name, PIN, neueIp());
  check("Gesperrt bleibt gesperrt, auch mit richtiger PIN und fremder IP (429)", g.status === 429);

  // ── Laufzeit: Mediane über je 7 Versuche (Zähler zwischen den Versuchen löschen, sonst Sperre)
  const U1 = await mk("t1"), U2 = await mk("t2", { benutzerAktiv: false });
  const fremd = `${stamp}-unbekannt`; namen.push(fremd);
  const zeiten = { "falsche PIN (bekannter Name)": [], "deaktiviert + richtige PIN": [], "unbekannter Name": [] };
  await login(U1.name, FALSCH); // Aufwärmen (Verbindungen, JIT)
  for (let i = 0; i < 7; i++) {
    await owner`delete from core.login_attempts where benutzername in ${owner([U1.name, U2.name, fremd])}`;
    zeiten["falsche PIN (bekannter Name)"].push((await login(U1.name, FALSCH)).ms);
    zeiten["deaktiviert + richtige PIN"].push((await login(U2.name, PIN)).ms);
    zeiten["unbekannter Name"].push((await login(fremd, PIN)).ms);
  }
  const med = Object.fromEntries(Object.entries(zeiten).map(([k, v]) => [k, median(v)]));
  const basis = med["falsche PIN (bekannter Name)"];
  console.log("     Mediane (ms): " + Object.entries(med).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(" | "));
  for (const [k, v] of Object.entries(med)) check(`Laufzeit ${k} innerhalb ±25 % der falschen PIN`, Math.abs(v - basis) / basis <= 0.25, `${v.toFixed(0)} ms gegen ${basis.toFixed(0)} ms`);
} finally {
  // Aufräumen nur über gemerkte IDs, exakte Namen und exakte IPs
  try {
    if (namen.length) await owner`delete from core.login_attempts where benutzername in ${owner(namen.map((n) => n.toLowerCase()))}`;
    if (ips.length) await owner`delete from core.login_attempts where ip in ${owner(ips)}`;
    if (ids.ben.length) await owner`delete from core.benutzer where id in ${owner(ids.ben)}`;
    if (ids.kam.length) await owner`delete from core.kameraden where id in ${owner(ids.kam)}`;
    const [{ n }] = await owner`select count(*)::int n from core.kameraden where name like ${stamp + "-%"}`;
    console.log(`Aufräumen: ${ids.ben.length} Benutzer, ${ids.kam.length} Kameraden, ${ips.length} IPs; Rest mit Zeitstempel ${stamp}: ${n}`);
  } catch (e) { console.log("AUFRÄUMEN FEHLGESCHLAGEN:", e.message, JSON.stringify({ ids, namen })); fail++; }
  await owner.end({ timeout: 5 });
}
console.log(fail === 0 ? "\nALLE TESTS OK" : `\n${fail} TEST(S) FEHLGESCHLAGEN`);
process.exit(fail ? 1 : 0);
