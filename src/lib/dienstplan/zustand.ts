import { sql } from "drizzle-orm";
import type { ScopedTx } from "@/lib/db/scoped";
import { expectRows } from "@/lib/db/rows";
import { DpFehler } from "@/lib/dienstplan/route";
import { pruefeKategorie } from "@/lib/dienstplan/termin";
import type { Zustand, ZThema } from "@/lib/dienstplan/rueckgaengig";

const ids = (xs: (number | null)[]) => [...new Set(xs.filter((x): x is number => x !== null))];
const liste = (xs: number[]) => sql.join(xs.map((x) => sql`${x}`), sql`, `);

async function vorhandene(tx: ScopedTx, abfrage: (l: ReturnType<typeof liste>) => ReturnType<typeof sql>, xs: number[]): Promise<Set<number>> {
  if (!xs.length) return new Set();
  return new Set([...await tx.execute<{ id: number }>(abfrage(liste(xs)))].map((r) => r.id));
}

/**
 * Setzt einen Termin vollständig auf einen Zustand (Rückgängig, Wiederherstellen
 * einer Version). Themen und Verantwortliche werden ersetzt. Verweise müssen zur
 * Organisation gehören; inaktive Themen und Kameraden sind erlaubt (früherer Stand).
 *
 * nachsichtig = false (Rückgängig): fehlender Verweis → 400.
 * nachsichtig = true (Version): fehlendes Thema wird Freitext mit dem Titel zum
 * Zeitpunkt, fehlender Block entfällt, fehlende Personen entfallen. Die Hinweise
 * dazu kommen zurück.
 */
export async function schreibeZustand(
  tx: ScopedTx,
  organisationId: number,
  terminId: number,
  z: Omit<Zustand, "themen"> & { themen: (ZThema & { titel?: string })[] },
  nachsichtig = false,
): Promise<string[]> {
  const hinweise: string[] = [];
  await pruefeKategorie(tx, organisationId, z.kategorieId);
  const alle = z.themen.flatMap((x) => x.verantwortliche);
  const themaIds = ids(z.themen.map((x) => x.themaId));
  const blockIds = ids(z.themen.map((x) => x.ausBlockId));
  const extIds = ids(alle.map((v) => v.externePersonId));
  const kamIds = ids(alle.map((v) => v.kameradId));
  const themen = await vorhandene(tx, (l) => sql`select id from dienstplan.themen where organisation_id = ${organisationId} and id in (${l})`, themaIds);
  const bloecke = await vorhandene(tx, (l) => sql`select id from dienstplan.themenbloecke where organisation_id = ${organisationId} and id in (${l})`, blockIds);
  const externe = await vorhandene(tx, (l) => sql`select id from dienstplan.externe_personen where organisation_id = ${organisationId} and id in (${l})`, extIds);
  const kameraden = await vorhandene(tx, (l) => sql`select id from dienstplan.kameraden_namen() where id in (${l})`, kamIds);
  const fehlt = (was: string) => { if (!nachsichtig) throw new DpFehler(400, `${was} nicht gefunden`); };
  if (themen.size !== themaIds.length) fehlt("Thema");
  if (bloecke.size !== blockIds.length) fehlt("Block");
  if (externe.size !== extIds.length) fehlt("Externe Person");
  if (kameraden.size !== kamIds.length) fehlt("Kamerad");

  expectRows(await tx.execute(sql`
    update dienstplan.termine
       set datum = ${z.datum}, uhrzeit = ${z.uhrzeit}, dauer_minuten = ${z.dauerMinuten}, kategorie_id = ${z.kategorieId},
           ausgefallen = ${z.ausgefallen}, ort = ${z.ort}, bemerkung = ${z.bemerkung}, notizen = ${z.notizen}
     where id = ${terminId} returning id`), "Termin");
  await tx.execute(sql`delete from dienstplan.termin_themen where termin_id = ${terminId}`);
  for (const [i, th] of z.themen.entries()) {
    let themaId = th.themaId;
    let freitext = th.titelFreitext;
    if (themaId !== null && !themen.has(themaId)) {
      themaId = null;
      freitext = (th.titel ?? "Thema").slice(0, 200);
      hinweise.push(`${z.datum}: Thema „${freitext}“ gibt es nicht mehr, als Freitext übernommen`);
    }
    const blockId = th.ausBlockId !== null && bloecke.has(th.ausBlockId) ? th.ausBlockId : null;
    const [neu] = expectRows(await tx.execute<{ id: number }>(sql`
      insert into dienstplan.termin_themen (termin_id, thema_id, titel_freitext, position, aus_block_id)
      values (${terminId}, ${themaId}, ${freitext}, ${i + 1}, ${blockId}) returning id`), "Termin-Thema");
    let pos = 0;
    for (const v of th.verantwortliche) {
      if ((v.kameradId !== null && !kameraden.has(v.kameradId)) || (v.externePersonId !== null && !externe.has(v.externePersonId))) {
        hinweise.push(`${z.datum}: eine Person gibt es nicht mehr, entfällt`);
        continue;
      }
      expectRows(await tx.execute(sql`
        insert into dienstplan.termin_verantwortliche (termin_thema_id, kamerad_id, externe_person_id, platzhalter, position)
        values (${neu.id}, ${v.kameradId}, ${v.externePersonId}, ${v.platzhalter}, ${++pos}) returning id`), "Verantwortlicher");
    }
  }
  return hinweise;
}
