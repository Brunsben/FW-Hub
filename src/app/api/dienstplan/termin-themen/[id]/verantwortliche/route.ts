import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { expectRows } from "@/lib/db/rows";
import { pruefeVerantwortlicher } from "@/lib/dienstplan/eingabe";
import { dienstplanRoute, DpFehler, leseBody, leseIdParam } from "@/lib/dienstplan/route";
import { pruefeKameradAktiv } from "@/lib/dienstplan/plan";

// Verantwortlichen an eine Themenposition hängen (Planer und Admin), ans Ende.
// Body: { kameradId } (aktiver Kamerad) oder { externePersonId } (aktive externe
// Person). Platzhalter gibt es nur in importierten Altdaten. Doppelt → 409.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return dienstplanRoute("Planer", async ({ s, tx }) => {
    const ttId = leseIdParam((await params).id);
    expectRows(await tx.execute(sql`select id from dienstplan.termin_themen where id = ${ttId}`), "Termin-Thema");
    const e = pruefeVerantwortlicher(await leseBody(req));
    if (!e.ok) throw new DpFehler(400, e.fehler);
    const d = e.daten;
    const kameradId = d.art === "kamerad" ? d.kameradId : null;
    const externId = d.art === "extern" ? d.externePersonId : null;
    if (kameradId) await pruefeKameradAktiv(tx, kameradId);
    if (externId) {
      const [x] = await tx.execute<{ aktiv: boolean }>(sql`select aktiv from dienstplan.externe_personen where id = ${externId} and organisation_id = ${s.organisationId}`);
      if (!x) throw new DpFehler(400, "Externe Person nicht gefunden");
      if (!x.aktiv) throw new DpFehler(400, "Externe Person ist nicht aktiv");
    }
    const doppelt = await tx.execute(sql`
      select 1 from dienstplan.termin_verantwortliche
       where termin_thema_id = ${ttId} and (kamerad_id = ${kameradId} or externe_person_id = ${externId})`);
    if (doppelt.length) throw new DpFehler(409, "Ist hier schon eingetragen");
    const [r] = expectRows(await tx.execute<{ id: number }>(sql`
      insert into dienstplan.termin_verantwortliche (termin_thema_id, kamerad_id, externe_person_id, position)
      values (${ttId}, ${kameradId}, ${externId},
              (select coalesce(max(position), 0)::int + 1 from dienstplan.termin_verantwortliche where termin_thema_id = ${ttId}))
      returning id`), "Verantwortlicher");
    return NextResponse.json({ id: r.id }, { status: 201 });
  });
}
