// Datenbank-Startschutz (src/lib/db/startup-check.ts): Abbruch in Produktion, Warnung in Entwicklung.
//
// Aufruf:  node scripts/test-startschutz.mjs
// Voraussetzung: Produktions-Build vorhanden (npm run build) und kein weiterer `next dev` im Projekt
// (der Dev-Server auf 3100 muss beendet sein, sonst sperrt Next.js den zweiten).
// Env (aus .env.local, falls vorhanden): DATABASE_URL (fw_app), AUTH_DATABASE_URL (fw_auth),
//   MIGRATE_DATABASE_URL (Owner = Superuser; dient hier als "falsche" Verbindung)
// Der Test startet Server auf den Ports 3102 (`next start`, NODE_ENV=production) und 3103 (`next dev`)
// mit manipulierten Umgebungen und liest deren Ausgabe. Er schreibt keine Daten.
//   Produktion: AUTH_DATABASE_URL leer, DATABASE_URL leer, Hauptverbindung als Superuser,
//               Auth-Verbindung als Superuser  →  Prozess endet mit Fehler und nennt den Grund;
//               korrekte Umgebung → Server läuft (/api/health), keine Meldung des Startschutzes.
//   Entwicklung: dieselben Fehler → nur Warnung, Server läuft weiter; korrekte Umgebung → keine Warnung.
//   Immer: In der Ausgabe stehen weder Datenbank-URLs noch Passwörter.
// Bricht ab (Exit 2), wenn eine der Datenbank-URLs nicht lokal ist.
import { execSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { schutz } from "./lib/schutz.mjs";

const P = resolve(fileURLToPath(new URL("..", import.meta.url)));
if (existsSync(`${P}/.env.local`)) process.loadEnvFile(`${P}/.env.local`);
schutz({ db: ["DATABASE_URL", "AUTH_DATABASE_URL", "MIGRATE_DATABASE_URL"] });
if (!existsSync(`${P}/.next/BUILD_ID`)) { console.error("Abbruch: kein Produktions-Build (.next/BUILD_ID fehlt). Zuerst `npm run build`."); process.exit(2); }

const NEXT = `${P}/node_modules/next/dist/bin/next`;
const GEHEIM = ["DATABASE_URL", "AUTH_DATABASE_URL", "MIGRATE_DATABASE_URL"]
  .flatMap((n) => { const x = new URL(process.env[n]); return [process.env[n], decodeURIComponent(x.password)]; })
  .filter((s) => s && s.length >= 4);
const SUPER = process.env.MIGRATE_DATABASE_URL;   // Owner = Superuser: für Haupt- und Auth-Verbindung verboten

let fail = 0;
const check = (n, c, i = "") => { if (!c) fail++; console.log(`${c ? "OK  " : "FEHLER"} ${n}${i ? " — " + i : ""}`); };

// Startet next im angegebenen Modus. Ergebnis: { exited, code, ready, out }
function lauf(modus, port, ueberschreiben, bereitPfad, warteMs = 120000) {
  return new Promise((fertig) => {
    const env = { ...process.env, ...ueberschreiben };
    delete env.NODE_ENV;   // next start setzt production, next dev development
    const args = modus === "start" ? ["start", "-p", String(port)] : ["dev", "--webpack", "-p", String(port)];
    const kind = spawn(process.execPath, [NEXT, ...args], { cwd: P, env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", beendet = false;
    const ende = (r) => { if (beendet) return; beendet = true; try { execSync(`taskkill /PID ${kind.pid} /T /F`, { stdio: "ignore" }); } catch { /* schon beendet */ } setTimeout(() => fertig({ out, ...r }), 800); };
    kind.stdout.on("data", (d) => (out += d)); kind.stderr.on("data", (d) => (out += d));
    kind.on("exit", (code) => ende({ exited: true, code, ready: false }));
    const start = Date.now();
    (async () => {
      while (!beendet && Date.now() - start < warteMs) {
        try { const r = await fetch(`http://127.0.0.1:${port}${bereitPfad}`); if (r.status === 200) { await new Promise((s) => setTimeout(s, 1500)); return ende({ exited: false, code: null, ready: true }); } } catch { /* startet noch */ }
        await new Promise((s) => setTimeout(s, 1000));
      }
      if (!beendet) ende({ exited: false, code: null, ready: false });
    })();
  });
}
const ohneGeheimnisse = (out) => !GEHEIM.some((g) => out.includes(g));

const faelle = [
  { n: "AUTH_DATABASE_URL leer", env: { AUTH_DATABASE_URL: "" }, grund: "AUTH_DATABASE_URL ist nicht gesetzt" },
  { n: "DATABASE_URL leer", env: { DATABASE_URL: "" }, grund: "DATABASE_URL ist nicht gesetzt" },
  { n: "Hauptverbindung als Superuser", env: { DATABASE_URL: SUPER }, grund: "Superuser- oder BYPASSRLS" },
  { n: "Auth-Verbindung als Superuser", env: { AUTH_DATABASE_URL: SUPER }, grund: "als Superuser" },
];

// ── Produktion (next start) ──
for (const f of faelle) {
  const r = await lauf("start", 3102, f.env, "/api/health", 90000);
  check(`Produktion, ${f.n}: Prozess bricht ab (Exit ≠ 0), kein Server`, r.exited && r.code !== 0 && !r.ready, `exited=${r.exited} code=${r.code} ready=${r.ready}`);
  check(`Produktion, ${f.n}: Ausgabe nennt "${f.grund}"`, r.out.includes(f.grund) && r.out.includes("Datenbank-Startschutz"));
  check(`Produktion, ${f.n}: keine URL und kein Passwort in der Ausgabe`, ohneGeheimnisse(r.out));
}
{
  const r = await lauf("start", 3102, {}, "/api/health", 90000);
  check("Produktion, korrekte Umgebung: Server läuft (/api/health 200)", r.ready && !r.exited, `ready=${r.ready} exited=${r.exited} code=${r.code}`);
  check("Produktion, korrekte Umgebung: keine Meldung des Startschutzes", !r.out.includes("Startschutz"));
  check("Produktion, korrekte Umgebung: keine URL und kein Passwort in der Ausgabe", ohneGeheimnisse(r.out));
}

// ── Entwicklung (next dev): nur Warnung ──
for (const f of faelle.filter((x) => x.env.AUTH_DATABASE_URL !== undefined || x.env.DATABASE_URL === SUPER)) {
  const r = await lauf("dev", 3103, f.env, "/login", 150000);
  check(`Entwicklung, ${f.n}: Server läuft trotzdem (/login 200)`, r.ready && !r.exited, `ready=${r.ready} exited=${r.exited} code=${r.code}`);
  check(`Entwicklung, ${f.n}: Warnung mit "${f.grund}", Start wird fortgesetzt`, r.out.includes("[WARNUNG] Datenbank-Startschutz") && r.out.includes(f.grund) && r.out.includes("Start wird fortgesetzt"));
  check(`Entwicklung, ${f.n}: keine URL und kein Passwort in der Ausgabe`, ohneGeheimnisse(r.out));
}
{
  const r = await lauf("dev", 3103, {}, "/login", 150000);
  check("Entwicklung, korrekte Umgebung: Server läuft, keine Warnung des Startschutzes", r.ready && !r.out.includes("Datenbank-Startschutz") && !/Another next dev server/.test(r.out), `ready=${r.ready}`);
  check("Entwicklung, korrekte Umgebung: keine URL und kein Passwort in der Ausgabe", ohneGeheimnisse(r.out));
}

console.log(fail === 0 ? "\nALLE TESTS OK" : `\n${fail} TEST(S) FEHLGESCHLAGEN`);
process.exit(fail ? 1 : 0);
