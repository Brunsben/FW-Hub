import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { expectRows } from "@/lib/db/rows";
import { pruefeTerminZustand } from "@/lib/dienstplan/eingabe";
import { dienstplanRoute, DpFehler, leseBody, leseIdParam } from "@/lib/dienstplan/route";
import { pruefeKategorie } from "@/lib/dienstplan/termin";

type Ctx = { params: Promise<{ id: string }> };

const ids = (xs: (number | null)[]) => [...new Set(xs.filter((x): x is number => x !== null))];
const liste = (xs: number[]) => sql.join(xs.map((x) => sql`${x}`), sql`, `);

// Termin vollständig auf einen Zustand setzen (Rückgängig/Wiederholen der
// Eingabemaske, Spec 7.2). Planer und Admin. Body:
//   { zustand: { datum, uhrzeit, dauerMinuten, kategorieId, ausgefallen, ort,
//                bemerkung, notizen, themen: [{ themaId | titelFreitext,
//                ausBlockId, verantwortliche: [{ kameradId | externePersonId |
//                platzhalter }] }] },
//     erwartet?: aktualisiertAm, das der Termin jetzt haben muss }
// Weicht der Termin von `erwartet` ab (jemand anderes hat ihn inzwischen
// geändert), 409 statt Überschreiben. Themen und Verantwortliche werden ersetzt
// (neue ids). Verweise müssen zur Organisation gehören; inaktive Themen,
// Kameraden und Platzhalter sind erlaubt, weil es um einen früheren Stand geht.
export async function PUT(req: Request, { params }: Ctx) {
  return dienstplanRoute("Planer", async ({ s, tx }) => {
    const terminId = leseIdParam((await params).id);
    const body = await leseBody(req);
    const [t] = expectRows(await tx.execute<{ jahr: number; stempel: string }>(sql`
      select p.jahr, to_char(t.aktualisiert_am at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as stempel
        from dienstplan.termine t join dienstplan.plaene p on p.id = t.plan_id
       where t.id = ${terminId} for update of t`), "Termin");
    if (body.erwartet !== undefined && body.erwartet !== t.stempel) {
      throw new DpFehler(409, "Der Termin wurde inzwischen anders geändert. Rückgängig ist hier nicht mehr möglich.");
    }
    const e = pruefeTerminZustand((body.zustand ?? {}) as Record<string, unknown>);
    if (!e.ok) throw new DpFehler(400, e.fehler);
    const z = e.daten;
    if (Number(z.datum.slice(0, 4)) !== t.jahr) throw new DpFehler(400, `Datum liegt nicht im Planjahr ${t.jahr}`);
    await pruefeKategorie(tx, s.organisationId, z.kategorieId);

    const pruefe = async (was: string, gefunden: number, soll: number) => { if (gefunden !== soll) throw new DpFehler(400, `${was} nicht gefunden`); };
    const themaIds = ids(z.themen.map((x) => x.themaId));
    if (themaIds.length) await pruefe("Thema", (await tx.execute(sql`select id from dienstplan.themen where organisation_id = ${s.organisationId} and id in (${liste(themaIds)})`)).length, themaIds.length);
    const blockIds = ids(z.themen.map((x) => x.ausBlockId));
    if (blockIds.length) await pruefe("Block", (await tx.execute(sql`select id from dienstplan.themenbloecke where organisation_id = ${s.organisationId} and id in (${liste(blockIds)})`)).length, blockIds.length);
    const alle = z.themen.flatMap((x) => x.verantwortliche);
    const extIds = ids(alle.map((v) => v.externePersonId));
    if (extIds.length) await pruefe("Externe Person", (await tx.execute(sql`select id from dienstplan.externe_personen where organisation_id = ${s.organisationId} and id in (${liste(extIds)})`)).length, extIds.length);
    const kamIds = ids(alle.map((v) => v.kameradId));
    if (kamIds.length) await pruefe("Kamerad", (await tx.execute(sql`select id from dienstplan.kameraden_namen() where id in (${liste(kamIds)})`)).length, kamIds.length);

    expectRows(await tx.execute(sql`
      update dienstplan.termine
         set datum = ${z.datum}, uhrzeit = ${z.uhrzeit}, dauer_minuten = ${z.dauerMinuten}, kategorie_id = ${z.kategorieId},
             ausgefallen = ${z.ausgefallen}, ort = ${z.ort}, bemerkung = ${z.bemerkung}, notizen = ${z.notizen}
       where id = ${terminId} returning id`), "Termin");
    await tx.execute(sql`delete from dienstplan.termin_themen where termin_id = ${terminId}`);
    for (const [i, th] of z.themen.entries()) {
      const [neu] = expectRows(await tx.execute<{ id: number }>(sql`
        insert into dienstplan.termin_themen (termin_id, thema_id, titel_freitext, position, aus_block_id)
        values (${terminId}, ${th.themaId}, ${th.titelFreitext}, ${i + 1}, ${th.ausBlockId}) returning id`), "Termin-Thema");
      for (const [j, v] of th.verantwortliche.entries()) {
        expectRows(await tx.execute(sql`
          insert into dienstplan.termin_verantwortliche (termin_thema_id, kamerad_id, externe_person_id, platzhalter, position)
          values (${neu.id}, ${v.kameradId}, ${v.externePersonId}, ${v.platzhalter}, ${j + 1}) returning id`), "Verantwortlicher");
      }
    }
    return NextResponse.json({ ok: true });
  });
}
