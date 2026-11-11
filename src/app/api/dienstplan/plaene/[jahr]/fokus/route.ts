import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { expectRows } from "@/lib/db/rows";
import { dienstplanRoute, DpFehler, leseBody, leseJahrParam } from "@/lib/dienstplan/route";
import { planOder404 } from "@/lib/dienstplan/plan";

type Ctx = { params: Promise<{ jahr: string }> };

// Fokus-Termin setzen (Schalter „Fokus“ der Eingabemaske, Spec 7.2): Die
// Präsentation markiert ihn, bis er wechselt. { terminId: number | null }.
// Ändert nicht die Version, aber den ETag (planEtag enthält den Fokus).
export async function PUT(req: Request, { params }: Ctx) {
  return dienstplanRoute("Planer", async ({ s, tx }) => {
    const plan = await planOder404(tx, s.organisationId, leseJahrParam((await params).jahr));
    const b = await leseBody(req);
    const id = b.terminId;
    if (id !== null && !(Number.isInteger(id) && (id as number) > 0)) throw new DpFehler(400, "terminId: Zahl oder null erwartet");
    if (id !== null) {
      const [t] = await tx.execute(sql`select 1 from dienstplan.termine where id = ${id as number} and plan_id = ${plan.id}`);
      if (!t) throw new DpFehler(400, "Termin gehört nicht zu diesem Plan");
    }
    expectRows(await tx.execute(sql`
      update dienstplan.plaene set fokus_termin_id = ${id as number | null} where id = ${plan.id} returning id`), "Plan");
    return NextResponse.json({ fokusTerminId: id });
  });
}
