import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import postgres from "postgres";
import type { APIRequestContext } from "@playwright/test";
import { schutz } from "../scripts/lib/schutz.mjs";

// Aufbau und Abbau der Testdaten für die E2E-Tests. Nur lokal (schutz), alle
// Namen mit Zeitstempel-Präfix, Aufräumen nur über gemerkte IDs.

export const BASE = process.env.E2E_BASE ?? "http://localhost:3100";
schutz({ db: ["MIGRATE_DATABASE_URL"], base: BASE });

export const owner = postgres(process.env.MIGRATE_DATABASE_URL!, { max: 1, onnotice: () => {} });
export const STEMPEL = `e2e${Date.now().toString(36)}`;
export const JAHR = 2076;

export const ids = { kameraden: [] as number[], plaene: [] as number[] };

/** Testkonto: globaler Admin (CSV-Import) und Dienstplan-Admin. */
export async function testkonto() {
  const name = `${STEMPEL}-admin`;
  const pin = randomBytes(9).toString("base64url");
  const [k] = await owner<{ id: number }[]>`
    insert into core.kameraden (name, vorname, dienst_rolle) values (${name}, 'E2E', 'Admin') returning id`;
  ids.kameraden.push(k.id);
  await owner`insert into core.benutzer (benutzername, pin, rolle, kamerad_id) values (${name}, ${await bcrypt.hash(pin, 10)}, 'Admin', ${k.id})`;
  return { name, pin, kameradId: k.id };
}

export async function anmelden(request: APIRequestContext, konto: { name: string; pin: string }) {
  const r = await request.post("/api/auth/login", {
    data: { benutzername: konto.name, pin: konto.pin },
    headers: { "x-real-ip": "203.0.113.201" },
  });
  if (r.status() !== 200) throw new Error(`Anmeldung fehlgeschlagen: ${r.status()}`);
}

/** Testplan im Entwurf mit drei Dienstabenden, je ein Thema und das Testkonto als Verantwortlicher. */
export async function testplan(kameradId: number) {
  await owner`delete from dienstplan.plaene where organisation_id = 1 and jahr = ${JAHR}`;
  const [{ id: katD }] = await owner<{ id: number }[]>`select id from dienstplan.kategorien where organisation_id = 1 and kuerzel = 'D'`;
  const [p] = await owner<{ id: number }[]>`insert into dienstplan.plaene (organisation_id, jahr) values (1, ${JAHR}) returning id`;
  ids.plaene.push(p.id);
  const termine: number[] = [];
  for (const [datum, titel] of [[`${JAHR}-01-14`, "Pumpenkunde"], [`${JAHR}-02-11`, "Atemschutz – Übung"], [`${JAHR}-09-08`, "Funk"]]) {
    const [t] = await owner<{ id: number }[]>`
      insert into dienstplan.termine (plan_id, datum, uhrzeit, kategorie_id) values (${p.id}, ${datum}, '19:30', ${katD}) returning id`;
    const [tt] = await owner<{ id: number }[]>`
      insert into dienstplan.termin_themen (termin_id, position, titel_freitext) values (${t.id}, 1, ${titel}) returning id`;
    await owner`insert into dienstplan.termin_verantwortliche (termin_thema_id, kamerad_id, position) values (${tt.id}, ${kameradId}, 1)`;
    termine.push(t.id);
  }
  return { planId: p.id, termine };
}

/** Anwesenheitsliste wie der Kreis-Export: Windows-1252, Kopf- und Summenzeilen, erfundene Namen. */
export function anwesenheitsliste(): Buffer {
  const zeilen = [
    ";Anwesenheitsliste;;;;;;",
    "Organisation;;;Musterstadt, OF;;;;",
    ";;;;;;;",
    `1;;${STEMPEL}Müller, Jörg (${STEMPEL}01);;;;;`,
    `2;;${STEMPEL}Weiß, René (${STEMPEL}02);;;;;`,
    `3;;${STEMPEL}Bank AG (z.Hd. Größe), Deutsche (${STEMPEL}03);;;;;`,
    "Gesamtsumme Personen: 3;;;;;;;",
  ].join("\r\n");
  const tabelle: Record<string, number> = { "ü": 0xfc, "ö": 0xf6, "ä": 0xe4, "ß": 0xdf, "é": 0xe9, "Ü": 0xdc, "Ö": 0xd6, "Ä": 0xc4 };
  return Buffer.from([...zeilen].map((c) => tabelle[c] ?? c.charCodeAt(0)));
}

/** Breite und Höhe aus dem PNG-Kopf (IHDR). */
export function pngGroesse(b: Buffer): [number, number] | null {
  return b.subarray(1, 4).toString() === "PNG" ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null;
}

export async function aufraeumen() {
  const importiert = await owner<{ id: number }[]>`select id from core.kameraden where name like ${STEMPEL + "%"}`;
  const alle = [...new Set([...ids.kameraden, ...importiert.map((k) => k.id)])];
  if (ids.plaene.length) await owner`delete from dienstplan.plaene where id in ${owner(ids.plaene)}`;
  if (alle.length) {
    await owner`delete from dienstplan.ical_abos where erstellt_von in ${owner(alle)}`;
    await owner`delete from core.mitglieder_audit where kamerad_id in ${owner(alle)}`;
    await owner`delete from core.benutzer where kamerad_id in ${owner(alle)}`;
    await owner`delete from core.kameraden where id in ${owner(alle)}`;
  }
  await owner`delete from core.login_attempts where benutzername like ${STEMPEL + "%"}`;
  const [rest] = await owner<{ p: number; k: number }[]>`select
    (select count(*)::int from dienstplan.plaene where organisation_id = 1 and jahr = ${JAHR}) p,
    (select count(*)::int from core.kameraden where name like ${STEMPEL + "%"}) k`;
  await owner.end({ timeout: 5 });
  return rest;
}
