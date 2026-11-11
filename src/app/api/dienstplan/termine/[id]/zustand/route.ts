import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { expectRows } from "@/lib/db/rows";
import { pruefeTerminZustand } from "@/lib/dienstplan/eingabe";
import { dienstplanRoute, DpFehler, leseBody, leseIdParam } from "@/lib/dienstplan/route";
import { schreibeZustand } from "@/lib/dienstplan/zustand";

type Ctx = { params: Promise<{ id: string }> };

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

    await schreibeZustand(tx, s.organisationId, terminId, z);
    return NextResponse.json({ ok: true });
  });
}
