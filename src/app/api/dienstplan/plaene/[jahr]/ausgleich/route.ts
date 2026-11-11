import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { zaehleEinteilungen, type AusgleichPosition } from "@/lib/dienstplan/ausgleich";
import { dienstplanRoute, leseJahrParam } from "@/lib/dienstplan/route";
import { findePlan, ladeAnzeigenamen, planOder404 } from "@/lib/dienstplan/plan";
import type { ScopedTx } from "@/lib/db/scoped";

async function positionen(tx: ScopedTx, planId: number): Promise<AusgleichPosition[]> {
  const rows = await tx.execute<AusgleichPosition>(sql`
    select k.kuerzel, t.ausgefallen,
           coalesce(array_agg(v.kamerad_id) filter (where v.kamerad_id is not null), '{}'::int[]) as "kameradIds"
      from dienstplan.termin_themen tt
      join dienstplan.termine t on t.id = tt.termin_id
      join dienstplan.kategorien k on k.id = t.kategorie_id
      left join dienstplan.termin_verantwortliche v on v.termin_thema_id = tt.id
     where t.plan_id = ${planId}
     group by tt.id, k.kuerzel, t.ausgefallen`);
  return [...rows];
}

// Ausgleich (Spec 7.2) für die Seitenleiste: Ausgleichspersonen mit Namen und
// ihrer Zahl im Vorjahresplan (Vergleich). Die Zahl im laufenden Plan rechnet
// die Eingabemaske nach jeder Änderung selbst (dieselbe Funktion
// zaehleEinteilungen aus lib/dienstplan/ausgleich.ts).
export async function GET(_req: Request, { params }: { params: Promise<{ jahr: string }> }) {
  return dienstplanRoute("Planer", async ({ s, tx }) => {
    const plan = await planOder404(tx, s.organisationId, leseJahrParam((await params).jahr));
    const ids = (await tx.execute<{ kameradId: number }>(sql`
      select kamerad_id as "kameradId" from dienstplan.ausgleich_personen where organisation_id = ${s.organisationId}`)).map((r) => r.kameradId);
    const { namen } = await ladeAnzeigenamen(tx);
    const vorjahrPlan = await findePlan(tx, s.organisationId, plan.jahr - 1);
    const vorjahr = vorjahrPlan ? zaehleEinteilungen(await positionen(tx, vorjahrPlan.id), ids) : null;
    const jetzt = zaehleEinteilungen(await positionen(tx, plan.id), ids);
    return NextResponse.json({
      vorjahr: vorjahrPlan ? plan.jahr - 1 : null,
      personen: ids.map((id) => ({ kameradId: id, name: namen.get(id) ?? "?", anzahl: jetzt.get(id) ?? 0, vorjahr: vorjahr ? vorjahr.get(id) ?? 0 : null })),
    });
  });
}
