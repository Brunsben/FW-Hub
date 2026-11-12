import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { expectRows } from "@/lib/db/rows";
import { pruefeBereich } from "@/lib/dienstplan/eingabe";
import { dienstplanRoute, DpFehler, leseBody, leseIdParam } from "@/lib/dienstplan/route";
import { setListe } from "@/lib/dienstplan/termin";

// Bereich umbenennen oder umsortieren (Planer und Admin).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return dienstplanRoute("Planer", async ({ s, tx }) => {
    const id = leseIdParam((await params).id);
    const e = pruefeBereich(await leseBody(req), "aendern");
    if (!e.ok) throw new DpFehler(400, e.fehler);
    expectRows(await tx.execute(sql`
      update dienstplan.bereiche set ${setListe({ ...e.daten }, { name: "name", sortierung: "sortierung" })}
       where id = ${id} and organisation_id = ${s.organisationId} returning id`), "Bereich");
    return NextResponse.json({ ok: true });
  });
}
