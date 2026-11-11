// Phase 11 Ende zu Ende: PDF (Spec 9.2) und Bild für Smartphone (Spec 9.3).
// Formate (PDF-Kopf, Seitenzahl, PNG 1290 × 2796), Parameter, Rechte je Rolle,
// kein Cache. Testkonten Planer und Mitglied; Pläne 2079 (freigegeben) und 2078 (Entwurf).
//
// Aufruf:  node scripts/test-dienstplan-druck.mjs
// Voraussetzung: Dev-Server (npx next dev --webpack -p 3100) mit derselben Datenbank.
// Env (aus .env.local): MIGRATE_DATABASE_URL (Owner), TEST_BASE optional.
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { schutz } from "./lib/schutz.mjs";

const P = resolve(fileURLToPath(new URL("..", import.meta.url)));
if (existsSync(`${P}/.env.local`)) process.loadEnvFile(`${P}/.env.local`);
const BASE = process.env.TEST_BASE || "http://localhost:3100";
schutz({ db: ["MIGRATE_DATABASE_URL"], base: BASE });
const req = createRequire(`${P}/package.json`);
const imp = async (m) => (await import(pathToFileURL(req.resolve(m)).href)).default;
const postgres = await imp("postgres");
const bcrypt = await imp("bcryptjs");
const owner = postgres(process.env.MIGRATE_DATABASE_URL, { max: 1, onnotice: () => {} });

let fail = 0, ok = 0;
const check = (name, cond, extra = "") => {
  if (cond) { ok++; console.log(`OK   ${name}`); }
  else { fail++; console.log(`FEHLER ${name}${extra ? " — " + extra : ""}`); }
};
const S = `dpdr${Date.now().toString(36)}`;
const JAHR = 2079, ENTWURF = 2078;
const ids = { kam: [], plan: [] };
let ip = 170;

async function konto(rolle) {
  const [k] = await owner`insert into core.kameraden (name, vorname, dienst_rolle) values (${S + rolle}, 'Dr', ${rolle === "Mitglied" ? null : rolle}) returning id`;
  ids.kam.push(k.id);
  const pin = `pin-${S}`;
  await owner`insert into core.benutzer (benutzername, pin, rolle, kamerad_id) values (${(S + rolle).toLowerCase()}, ${await bcrypt.hash(pin, 10)}, 'User', ${k.id})`;
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json", "x-real-ip": `203.0.113.${ip++}` },
    body: JSON.stringify({ benutzername: (S + rolle).toLowerCase(), pin }),
  });
  if (r.status !== 200) throw new Error(`Login ${rolle}: ${r.status}`);
  return { kameradId: k.id, cookie: (r.headers.get("set-cookie") || "").split(";")[0] };
}
async function hole(wer, pfad) {
  const r = await fetch(`${BASE}/api/dienstplan/plaene/${pfad}`, { headers: wer ? { cookie: wer.cookie } : {} });
  return { status: r.status, typ: r.headers.get("content-type") ?? "", cache: r.headers.get("cache-control") ?? "", disp: r.headers.get("content-disposition") ?? "", daten: Buffer.from(await r.arrayBuffer()) };
}
const seiten = (pdf) => (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
const pngGroesse = (b) => (b.subarray(1, 4).toString() === "PNG" ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null);

try {
  await owner`delete from dienstplan.plaene where jahr in (${JAHR}, ${ENTWURF})`;
  const planer = await konto("Planer"), mitglied = await konto("Mitglied");
  const kat = Object.fromEntries((await owner`select kuerzel, id from dienstplan.kategorien where organisation_id = 1`).map((k) => [k.kuerzel, k.id]));
  for (const [jahr, status] of [[JAHR, "freigegeben"], [ENTWURF, "entwurf"]]) {
    const [p] = await owner`insert into dienstplan.plaene (organisation_id, jahr, status) values (1, ${jahr}, ${status}) returning id`;
    ids.plan.push(p.id);
    for (const [datum, k] of [[`${jahr}-01-12`, "D"], [`${jahr}-03-02`, "Z"], [`${jahr}-09-14`, "D"], [`${jahr}-12-04`, "K"]]) {
      const [t] = await owner`insert into dienstplan.termine (plan_id, datum, uhrzeit, kategorie_id) values (${p.id}, ${datum}, '19:30', ${kat[k]}) returning id`;
      const [tt] = await owner`insert into dienstplan.termin_themen (termin_id, position, titel_freitext) values (${t.id}, 1, ${"Übung Größe " + datum}) returning id`;
      await owner`insert into dienstplan.termin_verantwortliche (termin_thema_id, kamerad_id, position) values (${tt.id}, ${planer.kameradId}, 1)`;
    }
  }

  // PDF
  let r = await hole(mitglied, `${JAHR}/export/pdf`);
  check("Mitglied: PDF ganzes Jahr → 200, application/pdf, 2 Seiten", r.status === 200 && r.typ === "application/pdf" && r.daten.subarray(0, 5).toString() === "%PDF-" && seiten(r.daten) === 2, `${r.status} ${r.typ} ${seiten(r.daten)}`);
  check("PDF: inline, kein Cache", r.disp.startsWith("inline") && r.disp.includes(`dienstplan-${JAHR}.pdf`) && r.cache.includes("no-store"), `${r.disp} ${r.cache}`);
  check("PDF: Schrift Inter eingebettet", r.daten.toString("latin1").includes("Inter"));
  r = await hole(mitglied, `${JAHR}/export/pdf?halbjahr=2`);
  check("PDF 2. Halbjahr: 1 Seite", r.status === 200 && seiten(r.daten) === 1, `${r.status} ${seiten(r.daten)}`);
  r = await hole(mitglied, `${JAHR}/export/pdf?halbjahr=3`);
  check("PDF: ungültiges Halbjahr → 400", r.status === 400, `${r.status}`);
  r = await hole(mitglied, `${ENTWURF}/export/pdf`);
  check("Mitglied: PDF eines Entwurfs → 404", r.status === 404, `${r.status}`);
  r = await hole(planer, `${ENTWURF}/export/pdf`);
  check("Planer: PDF eines Entwurfs → 200", r.status === 200 && seiten(r.daten) === 2, `${r.status}`);
  r = await hole(null, `${JAHR}/export/pdf`);
  check("ohne Anmeldung: PDF → 401", r.status === 401, `${r.status}`);

  // Bild
  r = await hole(mitglied, `${JAHR}/export/bild?halbjahr=1`);
  check("Mitglied: Bild → 200 image/png 1290 × 2796", r.status === 200 && r.typ === "image/png" && JSON.stringify(pngGroesse(r.daten)) === "[1290,2796]", `${r.status} ${r.typ} ${JSON.stringify(pngGroesse(r.daten))}`);
  check("Bild: inline, kein Cache, Dateiname", r.disp.includes(`dienstplan-${JAHR}-h1-hell.png`) && r.cache.includes("no-store") && !r.cache.includes("public"), `${r.disp} ${r.cache}`);
  const hell = r.daten;
  r = await hole(mitglied, `${JAHR}/export/bild?halbjahr=2&thema=dunkel&namen=1`);
  check("Bild dunkel mit Namen → 200, anderes Bild", r.status === 200 && JSON.stringify(pngGroesse(r.daten)) === "[1290,2796]" && !r.daten.equals(hell), `${r.status}`);
  for (const [q, n] of [["", "ohne Halbjahr"], ["?halbjahr=1&thema=bunt", "falsches Thema"], ["?halbjahr=1&namen=ja", "falsches namen"]]) {
    r = await hole(mitglied, `${JAHR}/export/bild${q}`);
    check(`Bild ${n} → 400`, r.status === 400, `${r.status}`);
  }
  r = await hole(mitglied, `${ENTWURF}/export/bild?halbjahr=1`);
  check("Mitglied: Bild eines Entwurfs → 404", r.status === 404, `${r.status}`);
  r = await hole(planer, `${ENTWURF}/export/bild?halbjahr=1`);
  check("Planer: Bild eines Entwurfs → 200", r.status === 200, `${r.status}`);
} finally {
  try {
    if (ids.plan.length) await owner`delete from dienstplan.plaene where id in ${owner(ids.plan)}`;
    if (ids.kam.length) await owner`delete from core.benutzer where kamerad_id in ${owner(ids.kam)}`;
    if (ids.kam.length) await owner`delete from core.mitglieder_audit where kamerad_id in ${owner(ids.kam)}`;
    if (ids.kam.length) await owner`delete from core.kameraden where id in ${owner(ids.kam)}`;
    await owner`delete from core.login_attempts where benutzername like ${S + "%"}`;
    const [rest] = await owner`select (select count(*)::int from dienstplan.plaene where jahr in (${JAHR}, ${ENTWURF})) p,
      (select count(*)::int from core.kameraden where name like ${S + "%"}) k`;
    console.log(`Aufräumen: Rest ${rest.p} Pläne, ${rest.k} Kameraden`);
    if (rest.p + rest.k > 0) fail++;
  } catch (e) { console.log("AUFRÄUMEN FEHLGESCHLAGEN:", e.message); fail++; }
  await owner.end({ timeout: 5 });
}
console.log(`\n${ok} OK, ${fail} Fehler`);
process.exit(fail ? 1 : 0);
