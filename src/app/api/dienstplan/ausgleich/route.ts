import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { expectRows } from "@/lib/db/rows";
import { dienstplanRoute, DpFehler, leseBody } from "@/lib/dienstplan/route";
import { ladeAnzeigenamen, pruefeKameradAktiv } from "@/lib/dienstplan/plan";

// Ausgleichsliste (Spec 7.2, Tabelle ausgleich_personen): die Gruppenführer,
// die etwa gleich oft eingeteilt werden sollen. Lesen Planer, pflegen nur der
// Dienstplan-Admin (Policy ausgleich_personen_schreiben).
export async function GET() {
  return dienstplanRoute("Planer", async ({ s, tx }) => {
    const rows = await tx.execute<{ kameradId: number }>(sql`
      select kamerad_id as "kameradId" from dienstplan.ausgleich_personen where organisation_id = ${s.organisationId}`);
    const { namen, kameraden } = await ladeAnzeigenamen(tx);
    const aktiv = new Map(kameraden.map((k) => [k.id, k.aktiv]));
    return NextResponse.json({
      personen: rows.map((r) => ({ kameradId: r.kameradId, name: namen.get(r.kameradId) ?? "?", aktiv: aktiv.get(r.kameradId) ?? false }))
        .sort((a, b) => a.name.localeCompare(b.name, "de")),
    });
  });
}

// Person aufnehmen: { kameradId } (aktiver Kamerad). Doppelt → 409.
export async function POST(req: Request) {
  return dienstplanRoute("Admin", async ({ s, tx }) => {
    const b = await leseBody(req);
    const id = b.kameradId;
    if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) throw new DpFehler(400, "kameradId muss eine positive ganze Zahl sein");
    await pruefeKameradAktiv(tx, id);
    const r = await tx.execute(sql`
      insert into dienstplan.ausgleich_personen (organisation_id, kamerad_id) values (${s.organisationId}, ${id})
      on conflict do nothing returning kamerad_id`);
    if (!r.length) throw new DpFehler(409, "Steht schon in der Ausgleichsliste");
    expectRows(r, "Ausgleich");
    return NextResponse.json({ ok: true }, { status: 201 });
  });
}
