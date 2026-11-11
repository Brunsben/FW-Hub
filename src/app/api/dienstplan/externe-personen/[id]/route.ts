import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { expectRows } from "@/lib/db/rows";
import { pruefeExternePerson } from "@/lib/dienstplan/eingabe";
import { dienstplanRoute, DpFehler, leseBody, leseIdParam } from "@/lib/dienstplan/route";
import { setListe } from "@/lib/dienstplan/termin";

// Externe Person ändern (Planer und Admin). Gelöscht wird nicht (alte Pläne
// verweisen darauf), stattdessen aktiv = false. Name und Organisation dürfen
// nicht beide leer werden (Check-Constraint → 400).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return dienstplanRoute("Planer", async ({ s, tx }) => {
    const id = leseIdParam((await params).id);
    const e = pruefeExternePerson(await leseBody(req), "aendern");
    if (!e.ok) throw new DpFehler(400, e.fehler);
    expectRows(await tx.execute(sql`
      update dienstplan.externe_personen
         set ${setListe({ ...e.daten }, { name: "name", organisation: "organisation", funktion: "funktion", email: "email", aktiv: "aktiv" })}
       where id = ${id} and organisation_id = ${s.organisationId} returning id`), "Externe Person");
    return NextResponse.json({ ok: true });
  });
}
