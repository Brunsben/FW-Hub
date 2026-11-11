import { sql } from "drizzle-orm";
import type { ScopedTx } from "@/lib/db/scoped";
import { expectRows } from "@/lib/db/rows";
import { anzeigenamen, anzeigenameExtern } from "@/lib/mitglieder/anzeigename";
import { feiertageNiedersachsen, rhythmusTreffer, type RhythmusRegel } from "@/lib/dienstplan/kalender";
import {
  berechneHinweise, type DpHinweis, type DpTermin, type DpTerminThema, type DpVerantwortlicher,
} from "@/lib/dienstplan/hinweise";
import { DpFehler } from "@/lib/dienstplan/route";

// Datenbankzugriffe des Dienstplans. Alle Funktionen laufen in einer Transaktion
// im Dienstplan-Scope (dienstplanRoute bzw. withDienstplanScope): RLS bestimmt,
// was sichtbar und schreibbar ist. Datum und Uhrzeit kommen als Text aus der
// Datenbank ("JJJJ-MM-TT", "HH:MM"), nie als Date-Objekt.

export type DpPlan = {
  id: number;
  jahr: number;
  status: "entwurf" | "freigegeben";
  version: number;
  freigegebenAm: string | null;
  freigegebenVon: number | null;
};

export type DpKategorie = {
  id: number;
  kuerzel: string;
  name: string;
  farbe: string;
  standardUhrzeit: string | null;
  standardDauerMinuten: number;
  sortierung: number;
  aktiv: boolean;
};

export const PLATZHALTER_NAME = { alle_gf: "alle Gruppenführer", offen: "offen" } as const;

/** ETag eines Plans: ändert sich mit jeder Änderung an Terminen und mit dem Status. */
export const planEtag = (p: Pick<DpPlan, "version" | "status">) => `"v${p.version}-${p.status}"`;

export async function findePlan(tx: ScopedTx, organisationId: number, jahr: number): Promise<DpPlan | null> {
  const [p] = await tx.execute<DpPlan>(sql`
    select id, jahr, status::text as status, version, to_char(freigegeben_am at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "freigegebenAm", freigegeben_von as "freigegebenVon"
      from dienstplan.plaene where organisation_id = ${organisationId} and jahr = ${jahr}`);
  return p ?? null;
}

export async function planOder404(tx: ScopedTx, organisationId: number, jahr: number): Promise<DpPlan> {
  const p = await findePlan(tx, organisationId, jahr);
  if (!p) throw new DpFehler(404, `Plan ${jahr} nicht gefunden`);
  return p;
}

export async function ladeKategorien(tx: ScopedTx, organisationId: number): Promise<DpKategorie[]> {
  return [...await tx.execute<DpKategorie>(sql`
    select id, kuerzel, name, farbe, to_char(standard_uhrzeit, 'HH24:MI') as "standardUhrzeit",
           standard_dauer_minuten as "standardDauerMinuten", sortierung, aktiv
      from dienstplan.kategorien where organisation_id = ${organisationId}
     order by sortierung, kuerzel`)];
}

type KameradName = { id: number; vorname: string; name: string; spitzname: string | null; spitzname_anzeigen: boolean; aktiv: boolean };

/** Anzeigenamen aller Kameraden (gegen alle aktiven berechnet, Spec 4.2). */
export async function ladeAnzeigenamen(tx: ScopedTx): Promise<{ namen: Map<number, string>; kameraden: KameradName[] }> {
  const kameraden = [...await tx.execute<KameradName>(sql`select id, vorname, name, spitzname, spitzname_anzeigen, aktiv from dienstplan.kameraden_namen()`)];
  const map = anzeigenamen(kameraden.map((k) => ({ ...k, spitznameAnzeigen: k.spitzname_anzeigen })));
  return { namen: new Map([...map].map(([id, a]) => [id, a.text])), kameraden };
}

/** Vollständiger Plan für Eingabemaske, Präsentation und Mitgliederansicht. */
export async function ladePlan(tx: ScopedTx, plan: DpPlan, organisationId: number) {
  const kategorien = await ladeKategorien(tx, organisationId);
  const roh = await tx.execute<Omit<DpTermin, "feiertag" | "themen">>(sql`
    select t.id, t.datum::text as datum, to_char(t.uhrzeit, 'HH24:MI') as uhrzeit, t.dauer_minuten as "dauerMinuten",
           t.kategorie_id as "kategorieId", k.kuerzel, t.quelle::text as quelle, t.regel_id as "regelId",
           t.rhythmus_datum::text as "rhythmusDatum", t.ausgefallen, t.ort, t.bemerkung, t.notizen,
           to_char(t.aktualisiert_am at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "aktualisiertAm"
      from dienstplan.termine t join dienstplan.kategorien k on k.id = t.kategorie_id
     where t.plan_id = ${plan.id}
     order by t.datum, t.uhrzeit nulls first, t.id`);
  const themen = await tx.execute<Omit<DpTerminThema, "verantwortliche"> & { terminId: number }>(sql`
    select tt.id, tt.termin_id as "terminId", tt.position, tt.thema_id as "themaId",
           coalesce(th.titel, tt.titel_freitext) as titel, tt.titel_freitext is not null as freitext,
           tt.aus_block_id as "ausBlockId"
      from dienstplan.termin_themen tt
      join dienstplan.termine t on t.id = tt.termin_id
      left join dienstplan.themen th on th.id = tt.thema_id
     where t.plan_id = ${plan.id}
     order by tt.termin_id, tt.position, tt.id`);
  const verantwortliche = await tx.execute<Omit<DpVerantwortlicher, "art" | "name"> & { terminThemaId: number; extName: string | null; extOrganisation: string | null }>(sql`
    select v.id, v.termin_thema_id as "terminThemaId", v.position, v.kamerad_id as "kameradId",
           v.externe_person_id as "externePersonId", v.platzhalter, e.name as "extName", e.organisation as "extOrganisation"
      from dienstplan.termin_verantwortliche v
      join dienstplan.termin_themen tt on tt.id = v.termin_thema_id
      join dienstplan.termine t on t.id = tt.termin_id
      left join dienstplan.externe_personen e on e.id = v.externe_person_id
     where t.plan_id = ${plan.id}
     order by v.termin_thema_id, v.position, v.id`);
  const { namen } = await ladeAnzeigenamen(tx);
  const pflicht = [...await tx.execute<{ id: number; titel: string }>(sql`
    select id, titel from dienstplan.themen
     where organisation_id = ${organisationId} and pflicht_jaehrlich and aktiv order by titel`)];

  const vProThema = new Map<number, DpVerantwortlicher[]>();
  for (const v of verantwortliche) {
    const art = v.kameradId !== null ? "kamerad" : v.externePersonId !== null ? "extern" : "platzhalter";
    const name = art === "kamerad" ? namen.get(v.kameradId!) ?? "?"
      : art === "extern" ? anzeigenameExtern({ name: v.extName, organisation: v.extOrganisation })
        : PLATZHALTER_NAME[v.platzhalter as "alle_gf" | "offen"];
    const liste = vProThema.get(v.terminThemaId) ?? [];
    liste.push({ id: v.id, position: v.position, art, kameradId: v.kameradId, externePersonId: v.externePersonId, platzhalter: v.platzhalter, name });
    vProThema.set(v.terminThemaId, liste);
  }
  const thProTermin = new Map<number, DpTerminThema[]>();
  for (const th of themen) {
    const liste = thProTermin.get(th.terminId) ?? [];
    liste.push({ id: th.id, position: th.position, themaId: th.themaId, titel: th.titel, freitext: th.freitext, ausBlockId: th.ausBlockId, verantwortliche: vProThema.get(th.id) ?? [] });
    thProTermin.set(th.terminId, liste);
  }
  const feiertage = feiertageNiedersachsen(plan.jahr);
  const termine: DpTermin[] = roh.map((t) => ({ ...t, feiertag: feiertage.get(t.datum) ?? null, themen: thProTermin.get(t.id) ?? [] }));
  const hinweise: DpHinweis[] = berechneHinweise(termine, pflicht);
  return { plan, kategorien, termine, hinweise };
}

// ── Generator (Spec 5.3) ─────────────────────────────────────────────────────

/**
 * Legt für jede aktive Regel alle Treffer des Planjahres als Termin an, sofern es
 * für (Regel, Rhythmusdatum) noch keinen gibt. Idempotent; bestehende Termine
 * werden nie überschrieben oder gelöscht (verschobene behalten rhythmus_datum,
 * abgesagte sind ausgefallen). Feiertage werden trotzdem angelegt (Hinweis).
 */
export async function generiereTermine(tx: ScopedTx, plan: DpPlan, organisationId: number) {
  const regeln = [...await tx.execute<RhythmusRegel>(sql`
    select id, name, typ::text as typ, wochentag, to_char(uhrzeit, 'HH24:MI') as uhrzeit, anker_datum::text as "ankerDatum",
           muster, nter_wochentag as "nterWochentag", monate, kategorie_kuerzel as "kategorieKuerzel",
           gueltig_ab::text as "gueltigAb", gueltig_bis::text as "gueltigBis", aktiv
      from dienstplan.rhythmus_regeln where organisation_id = ${organisationId} and aktiv`)];
  const kategorien = new Map((await ladeKategorien(tx, organisationId)).filter((k) => k.aktiv).map((k) => [k.kuerzel.toUpperCase(), k.id]));
  const treffer = rhythmusTreffer(regeln, plan.jahr);
  const unbekannt = new Set<string>();
  let neu = 0;
  for (const t of treffer) {
    const kategorieId = kategorien.get(t.kuerzel);
    if (!kategorieId) { unbekannt.add(t.kuerzel); continue; }
    const r = await tx.execute(sql`
      insert into dienstplan.termine (plan_id, datum, uhrzeit, kategorie_id, quelle, regel_id, rhythmus_datum)
      values (${plan.id}, ${t.datum}, ${t.uhrzeit}, ${kategorieId}, 'rhythmus', ${t.regelId}, ${t.datum})
      on conflict (plan_id, regel_id, rhythmus_datum) where regel_id is not null do nothing
      returning id`);
    neu += r.length;
  }
  return { treffer: treffer.length, neu, unbekannteKuerzel: [...unbekannt] };
}

// ── Termine und Positionen ───────────────────────────────────────────────────

export type TerminKopf = { id: number; planId: number; jahr: number; status: string; quelle: string; datum: string };

export async function ladeTerminKopf(tx: ScopedTx, terminId: number): Promise<TerminKopf> {
  const [t] = expectRows(await tx.execute<TerminKopf>(sql`
    select t.id, t.plan_id as "planId", p.jahr, p.status::text as status, t.quelle::text as quelle, t.datum::text as datum
      from dienstplan.termine t join dienstplan.plaene p on p.id = t.plan_id where t.id = ${terminId}`), "Termin");
  return t;
}

export async function naechsteThemenPosition(tx: ScopedTx, terminId: number): Promise<number> {
  const [r] = await tx.execute<{ p: number }>(sql`select coalesce(max(position), 0)::int + 1 as p from dienstplan.termin_themen where termin_id = ${terminId}`);
  return r.p;
}

/** Positionen der Themen eines Termins lückenlos 1..n setzen, `vorne` an die gewünschte Stelle. */
export async function themenNeuNummerieren(tx: ScopedTx, terminId: number, vorne?: { id: number; position: number }) {
  const ids = (await tx.execute<{ id: number }>(sql`select id from dienstplan.termin_themen where termin_id = ${terminId} order by position, id`)).map((r) => r.id);
  if (vorne) {
    const rest = ids.filter((x) => x !== vorne.id);
    rest.splice(Math.min(Math.max(vorne.position, 1), rest.length + 1) - 1, 0, vorne.id);
    ids.splice(0, ids.length, ...rest);
  }
  for (const [i, id] of ids.entries()) {
    await tx.execute(sql`update dienstplan.termin_themen set position = ${i + 1} where id = ${id} and position <> ${i + 1}`);
  }
}

/** Gültiger Kamerad für eine neue Einteilung: vorhanden und aktiv. */
export async function pruefeKameradAktiv(tx: ScopedTx, kameradId: number) {
  const [k] = await tx.execute<{ aktiv: boolean }>(sql`select aktiv from dienstplan.kameraden_namen() where id = ${kameradId}`);
  if (!k) throw new DpFehler(400, "Kamerad nicht gefunden");
  if (!k.aktiv) throw new DpFehler(400, "Kamerad ist nicht aktiv");
}
