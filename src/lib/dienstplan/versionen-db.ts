import { sql } from "drizzle-orm";
import type { ScopedTx } from "@/lib/db/scoped";
import { expectRows } from "@/lib/db/rows";
import { DpFehler } from "@/lib/dienstplan/route";
import { ladeAnzeigenamen, ladeTermine, speichereVersion, type DpPlan } from "@/lib/dienstplan/plan";
import { abbildAus, wiederherstellPlan, type VersionInhalt } from "@/lib/dienstplan/versionen";
import { schreibeZustand } from "@/lib/dienstplan/zustand";

// Versionen eines Plans in der Datenbank (Phase 9). Lesen per RLS: Planer alle,
// Mitglieder nur Freigabe-Versionen freigegebener Pläne (Migration 0021).

export type VersionKopf = {
  nummer: number;
  anlass: "freigabe" | "manuell";
  bezeichnung: string | null;
  erstelltAm: string;
  erstelltVon: number;
  erstelltVonName: string;
  anzahlTermine: number;
};

export async function listeVersionen(tx: ScopedTx, planId: number): Promise<VersionKopf[]> {
  const roh = await tx.execute<Omit<VersionKopf, "erstelltVonName">>(sql`
    select nummer, anlass, bezeichnung,
           to_char(erstellt_am at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "erstelltAm",
           erstellt_von as "erstelltVon", jsonb_array_length(inhalt->'termine') as "anzahlTermine"
      from dienstplan.plan_versionen where plan_id = ${planId} order by nummer desc`);
  const { namen } = await ladeAnzeigenamen(tx);
  return roh.map((v) => ({ ...v, erstelltVonName: namen.get(v.erstelltVon) ?? "?" }));
}

export async function ladeVersion(tx: ScopedTx, planId: number, nummer: number): Promise<VersionKopf & { inhalt: VersionInhalt }> {
  const [v] = await tx.execute<Omit<VersionKopf, "erstelltVonName"> & { inhalt: VersionInhalt }>(sql`
    select nummer, anlass, bezeichnung,
           to_char(erstellt_am at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "erstelltAm",
           erstellt_von as "erstelltVon", jsonb_array_length(inhalt->'termine') as "anzahlTermine", inhalt
      from dienstplan.plan_versionen where plan_id = ${planId} and nummer = ${nummer}`);
  if (!v) throw new DpFehler(404, `Version ${nummer} nicht gefunden`);
  const { namen } = await ladeAnzeigenamen(tx);
  return { ...v, erstelltVonName: namen.get(v.erstelltVon) ?? "?" };
}

/** Aktueller Stand als Abbild (für Vergleich "aktuell"). */
export async function aktuellesAbbild(tx: ScopedTx, plan: Pick<DpPlan, "id" | "jahr">): Promise<VersionInhalt> {
  return abbildAus(plan.jahr, await ladeTermine(tx, plan));
}

/**
 * Wiederherstellen (Spec 8, nur Admin): Der Stand der Version wird zum neuen
 * Entwurf. Vorher wird der aktuelle Stand als Version gesichert, keine Version
 * wird gelöscht. Termine, die es noch gibt, behalten ihre id (stabile iCal-UIDs);
 * nur abweichende werden geschrieben. Termine, die es nicht mehr gibt, werden neu
 * angelegt; Termine, die in der Version fehlen, gelöscht.
 */
export async function stelleWiederHer(
  tx: ScopedTx, plan: DpPlan, organisationId: number, kameradId: number, nummer: number,
): Promise<{ gesichert: number; geaendert: number; angelegt: number; geloescht: number; hinweise: string[] }> {
  const ziel = await ladeVersion(tx, plan.id, nummer);
  const gesichert = await speichereVersion(tx, plan, kameradId, "manuell", `Vor Wiederherstellung von Version ${nummer}`);
  if (plan.status === "freigegeben") {
    expectRows(await tx.execute(sql`
      update dienstplan.plaene set status = 'entwurf', freigegeben_am = null, freigegeben_von = null
       where id = ${plan.id} returning id`), "Plan");
  }
  const aktuell = await aktuellesAbbild(tx, plan);
  const schritte = wiederherstellPlan(aktuell.termine, ziel.inhalt.termine);
  const hinweise: string[] = [];
  if (schritte.loeschen.length) {
    await tx.execute(sql`delete from dienstplan.termine where plan_id = ${plan.id}
      and id in (${sql.join(schritte.loeschen.map((i) => sql`${i}`), sql`, `)})`);
  }
  const regeln = new Set([...await tx.execute<{ id: number }>(sql`
    select id from dienstplan.rhythmus_regeln where organisation_id = ${organisationId}`)].map((r) => r.id));
  for (const t of schritte.aendern) hinweise.push(...await schreibeZustand(tx, organisationId, t.id, t, true));
  for (const t of schritte.anlegen) {
    const regelId = t.regelId !== null && regeln.has(t.regelId) ? t.regelId : null;
    const [neu] = expectRows(await tx.execute<{ id: number }>(sql`
      insert into dienstplan.termine (plan_id, datum, kategorie_id, quelle, regel_id, rhythmus_datum)
      values (${plan.id}, ${t.datum}, ${t.kategorieId}, ${t.quelle}::dienstplan.termin_quelle, ${regelId},
              ${regelId === null ? null : t.rhythmusDatum}) returning id`), "Termin");
    hinweise.push(...await schreibeZustand(tx, organisationId, neu.id, t, true));
  }
  return {
    gesichert: gesichert.nummer,
    geaendert: schritte.aendern.length,
    angelegt: schritte.anlegen.length,
    geloescht: schritte.loeschen.length,
    hinweise: [...new Set(hinweise)],
  };
}
