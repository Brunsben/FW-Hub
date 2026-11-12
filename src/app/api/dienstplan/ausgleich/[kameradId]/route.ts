import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { expectRows } from "@/lib/db/rows";
import { dienstplanRoute, leseIdParam } from "@/lib/dienstplan/route";

// Person aus der Ausgleichsliste nehmen (nur Dienstplan-Admin).
export async function DELETE(_req: Request, { params }: { params: Promise<{ kameradId: string }> }) {
  return dienstplanRoute("Admin", async ({ s, tx }) => {
    const id = leseIdParam((await params).kameradId);
    expectRows(await tx.execute(sql`
      delete from dienstplan.ausgleich_personen where organisation_id = ${s.organisationId} and kamerad_id = ${id} returning kamerad_id`), "Ausgleichsperson");
    return NextResponse.json({ ok: true });
  });
}
