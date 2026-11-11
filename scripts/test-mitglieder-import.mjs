// CSV-Import von Kameraden per HTTP (/api/mitglieder/import): Rechte, Vorschau,
// Übernahme (anlegen und ergänzen), Schutz gegen veraltete Auswahl, Protokoll.
//
// Aufruf:  node scripts/test-mitglieder-import.mjs
// Env aus .env.local: MIGRATE_DATABASE_URL (Owner: Testkonten, Kontrolle,
// Aufräumen), TEST_BASE optional (Standard http://localhost:3100).
// Voraussetzung: Dev-Server (npx next dev --webpack -p 3100). Alle Namen sind
// erfunden und tragen einen Zeitstempel; aufgeräumt wird über gemerkte IDs.
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { schutz } from "./lib/schutz.mjs";

const P = resolve(fileURLToPath(new URL("..", import.meta.url)));
if (existsSync(`${P}/.env.local`)) process.loadEnvFile(`${P}/.env.local`);
const req = createRequire(`${P}/package.json`);
const imp = async (m) => import(pathToFileURL(req.resolve(m)).href);
const postgres = (await imp("postgres")).default;
const bcrypt = (await imp("bcryptjs")).default;
const BASE = process.env.TEST_BASE || "http://localhost:3100";

schutz({ db: ["MIGRATE_DATABASE_URL"], base: BASE });
const owner = postgres(process.env.MIGRATE_DATABASE_URL, { max: 1, onnotice: () => {} });

const stamp = `im${Date.now().toString(36)}`;
const PIN = "121212";
let fail = 0;
const check = (n, c, i = "") => { if (!c) fail++; console.log(`${c ? "OK  " : "FEHLER"} ${n}${i ? " — " + i : ""}`); };
const ids = [], namen = [];
let ip = 0;
const hash = await bcrypt.hash(PIN, 12);

async function konto(suffix, { appRolle = "User", psa = null, login = true, pnr = null } = {}) {
  const name = `${stamp}-${suffix}`; namen.push(name);
  const [k] = await owner`insert into core.kameraden (name, vorname, aktiv, psa_rolle, personalnummer)
    values (${name}, 'Imp', true, ${psa}, ${pnr}) returning id`;
  ids.push(k.id);
  if (login) await owner`insert into core.benutzer (benutzername, pin, rolle, kamerad_id) values (${name}, ${hash}, ${appRolle}, ${k.id})`;
  return { name, kamerad: k.id, cookie: null };
}
async function anmelden(k) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": `203.0.113.${++ip + 150}` },
    body: JSON.stringify({ benutzername: k.name, pin: PIN }),
  });
  if (r.status !== 200) throw new Error(`Anmeldung ${k.name} → ${r.status}`);
  k.cookie = (r.headers.get("set-cookie") || "").split(";")[0];
}
async function api(cookie, body) {
  const r = await fetch(`${BASE}/api/mitglieder/import`, {
    method: "POST",
    headers: { ...(cookie ? { cookie } : {}), "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let json = null; try { json = await r.json(); } catch { /* leer */ }
  return { status: r.status, json };
}
const b64 = (bytes) => Buffer.from(bytes).toString("base64");
const win1252 = (s) => Uint8Array.from([...s].map((c) => ({ "ü": 0xfc, "ö": 0xf6, "ä": 0xe4, "ß": 0xdf, "é": 0xe9 }[c] ?? c.charCodeAt(0))));

try {
  const admin = await konto("admin", { appRolle: "Admin" });
  const kw = await konto("kw", { psa: "Kleiderwart" });
  const ohnePnr = await konto("ohnepnr", { login: false });           // wird ergänzt
  await konto("mitpnr", { login: false, pnr: `${stamp}-77` }); // vorhanden
  await anmelden(admin); await anmelden(kw);

  // Anwesenheitsliste in Windows-1252, wie sie der Kreis-Export liefert
  const liste = [
    ";Anwesenheitsliste;;;;;;",
    "Organisation;;;Musterstadt, OF;;;;",
    ";;;;;;;",
    `1;;${stamp}-Müller, Jörg (${stamp}-01);;;;;`,
    `2;;${stamp}-Weiß, René (${stamp}-02);;;;;`,
    `3;;${stamp}-ohnepnr, Imp (${stamp}-03);;;;;`,
    `4;;${stamp}-mitpnr, Imp (${stamp}-77);;;;;`,
    `5;;${stamp}-Bank AG (z.Hd. X), Deutsche (${stamp}-04);;;;;`,
    `6;;${stamp}-Fremd, Fritz (${stamp}-77);;;;;`,
    "Gesamtsumme Personen: 6;;;;;;;",
  ].join("\r\n");
  const datei = b64(win1252(liste));

  let r = await api(null, { datei });
  check("ohne Anmeldung → 401", r.status === 401, `${r.status}`);
  r = await api(kw.cookie, { datei });
  check("Kleiderwart (keine globale Admin-Rolle) → 403", r.status === 403, `${r.status}`);
  r = await api(admin.cookie, {});
  check("ohne Datei → 400", r.status === 400);
  r = await api(admin.cookie, { datei: b64(new TextEncoder().encode("foo;bar\nbaz;qux\n")) });
  check("unbekanntes Format → 400 mit Meldung", r.status === 400 && /Format nicht erkannt/.test(r.json?.error ?? ""), r.json?.error);
  r = await api(admin.cookie, { datei: b64(new Uint8Array(600 * 1024).fill(65)) });
  check("zu große Datei → 400", r.status === 400 && /zu groß/.test(r.json?.error ?? ""));

  // Vorschau
  r = await api(admin.cookie, { datei });
  const st = Object.fromEntries((r.json?.zeilen ?? []).map((z) => [z.zeile, z.status]));
  check("Vorschau → 200, Format Anwesenheitsliste", r.status === 200 && r.json.format === "anwesenheitsliste", `${r.status}`);
  check("Vorschau: Umlaute aus Windows-1252 richtig", r.json.zeilen.find((z) => z.zeile === 4)?.nachname === `${stamp}-Müller` && r.json.zeilen.find((z) => z.zeile === 5)?.vorname === "René");
  check("Vorschau: Status je Zeile", JSON.stringify(st) === JSON.stringify({ 4: "neu", 5: "neu", 6: "ergaenzen", 7: "vorhanden", 8: "pruefen", 9: "konflikt" }), JSON.stringify(st));
  const [{ n: vorher }] = await owner`select count(*)::int n from core.kameraden where name like ${stamp + "-%"}`;
  check("Vorschau schreibt nichts", vorher === 4, `${vorher}`);

  // Auswahl nicht übernehmbarer Zeilen
  r = await api(admin.cookie, { datei, uebernehmen: [9] });
  check("Konfliktzeile auswählen → 409", r.status === 409, `${r.status} ${r.json?.error}`);
  r = await api(admin.cookie, { datei, uebernehmen: [2] });
  check("Zeile ohne Person → 400", r.status === 400, `${r.status}`);
  r = await api(admin.cookie, { datei, uebernehmen: [] });
  check("leere Auswahl → 400", r.status === 400);
  r = await api(admin.cookie, { datei, uebernehmen: [4, 9] });
  check("Mischung mit Konflikt: 409, nichts angelegt", r.status === 409 && (await owner`select 1 from core.kameraden where name = ${stamp + "-Müller"}`).length === 0);

  // Übernahme: zwei neue, eine Ergänzung
  r = await api(admin.cookie, { datei, uebernehmen: [4, 5, 6] });
  check("Übernahme → 200 mit Zählern", r.status === 200 && r.json.angelegt === 2 && r.json.ergaenzt === 1, JSON.stringify(r.json));
  const neu = await owner`select id, name, vorname, personalnummer, aktiv, spitzname_anzeigen, psa_rolle, dienst_rolle, karten_id
    from core.kameraden where name in (${stamp + "-Müller"}, ${stamp + "-Weiß"}) order by name`;
  ids.push(...neu.map((k) => k.id));
  check("neue Kameraden: aktiv, Personalnummer, keine Rollen/Karte",
    neu.length === 2 && neu.every((k) => k.aktiv && !k.spitzname_anzeigen && !k.psa_rolle && !k.dienst_rolle && !k.karten_id) &&
    neu[0].personalnummer === `${stamp}-01` && neu[0].vorname === "Jörg", JSON.stringify(neu.map((k) => k.personalnummer)));
  const [erg] = await owner`select personalnummer, name, vorname from core.kameraden where id = ${ohnePnr.kamerad}`;
  check("Ergänzung: nur Personalnummer nachgetragen", erg.personalnummer === `${stamp}-03` && erg.name === `${stamp}-ohnepnr` && erg.vorname === "Imp");
  const prot = await owner`select kamerad_id, abschnitt, feld, akteur_kamerad_id from core.mitglieder_audit
    where kamerad_id in ${owner([ohnePnr.kamerad, ...neu.map((k) => k.id)])} order by id`;
  check("Änderungsprotokoll: Anlage und Ergänzung mit Admin als Akteur",
    prot.some((p) => p.kamerad_id === ohnePnr.kamerad && p.feld === "personalnummer" && p.akteur_kamerad_id === admin.kamerad) &&
    neu.every((k) => prot.some((p) => p.kamerad_id === k.id && p.akteur_kamerad_id === admin.kamerad)), `${prot.length} Einträge`);

  // Zweiter Lauf mit derselben Datei: alles vorhanden, alte Auswahl wird abgelehnt
  r = await api(admin.cookie, { datei });
  const st2 = Object.fromEntries(r.json.zeilen.map((z) => [z.zeile, z.status]));
  check("zweite Vorschau: angelegte und ergänzte Zeilen sind vorhanden", st2[4] === "vorhanden" && st2[5] === "vorhanden" && st2[6] === "vorhanden", JSON.stringify(st2));
  r = await api(admin.cookie, { datei, uebernehmen: [4] });
  check("veraltete Auswahl (schon angelegt) → 409, keine Dublette", r.status === 409 &&
    (await owner`select count(*)::int n from core.kameraden where name = ${stamp + "-Müller"}`)[0].n === 1);

  // Tabelle mit Kopfzeile (UTF-8 mit BOM), Spitzname
  const tab = `﻿Nachname;Vorname;Spitzname;Personalnummer\r\n${stamp}-Tab;Tina;TT;\r\n`;
  r = await api(admin.cookie, { datei: b64(new TextEncoder().encode(tab)), uebernehmen: [2] });
  const [tk] = await owner`select id, spitzname, personalnummer from core.kameraden where name = ${stamp + "-Tab"}`;
  if (tk) ids.push(tk.id);
  check("Tabelle: angelegt mit Spitzname, ohne Personalnummer", r.status === 200 && tk?.spitzname === "TT" && tk.personalnummer === null, `${r.status}`);
} finally {
  try {
    const rest = await owner`select id from core.kameraden where name like ${stamp + "-%"}`;
    for (const { id } of rest) if (!ids.includes(id)) ids.push(id);
    if (namen.length) await owner`delete from core.login_attempts where benutzername in ${owner(namen.map((n) => n.toLowerCase()))}`;
    if (ids.length) await owner`delete from core.mitglieder_audit where kamerad_id in ${owner(ids)}`;
    if (ids.length) await owner`delete from core.benutzer where kamerad_id in ${owner(ids)}`;
    if (ids.length) await owner`delete from core.kameraden where id in ${owner(ids)}`;
    const [{ n }] = await owner`select count(*)::int n from core.kameraden where name like ${stamp + "-%"}`;
    console.log(`Aufräumen: ${ids.length} Kameraden samt Zugängen und Protokoll; Rest mit Zeitstempel ${stamp}: ${n}`);
  } catch (e) { console.log("AUFRÄUMEN FEHLGESCHLAGEN:", e.message); fail++; }
  await owner.end({ timeout: 5 });
}
console.log(fail === 0 ? "\nALLE TESTS OK" : `\n${fail} TEST(S) FEHLGESCHLAGEN`);
process.exit(fail ? 1 : 0);
