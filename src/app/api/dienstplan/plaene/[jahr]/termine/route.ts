import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { expectRows } from "@/lib/db/rows";
import { pruefeTermin } from "@/lib/dienstplan/eingabe";
import { dienstplanRoute, DpFehler, leseBody, leseJahrParam } from "@/lib/dienstplan/route";
import { planOder404 } from "@/lib/dienstplan/plan";
import { pruefeKategorie } from "@/lib/dienstplan/termin";

// Manuellen Termin anlegen (Planer und Admin; auch nach der Freigabe, Spec 6).
// Body: { datum, kategorieId, uhrzeit?, dauerMinuten?, ort?, bemerkung?, notizen?, ausgefallen? }
// Das Datum muss im Planjahr liegen.
export async function POST(req: Request, { params }: { params: Promise<{ jahr: string }> }) {
  return dienstplanRoute("Planer", async ({ s, tx }) => {
    const plan = await planOder404(tx, s.organisationId, leseJahrParam((await params).jahr));
    const e = pruefeTermin(await leseBody(req), "neu");
    if (!e.ok) throw new DpFehler(400, e.fehler);
    const t = e.daten;
    if (Number(t.datum!.slice(0, 4)) !== plan.jahr) throw new DpFehler(400, `Datum liegt nicht im Planjahr ${plan.jahr}`);
    await pruefeKategorie(tx, s.organisationId, t.kategorieId!);
    const [neu] = expectRows(await tx.execute<{ id: number }>(sql`
      insert into dienstplan.termine (plan_id, datum, uhrzeit, dauer_minuten, kategorie_id, quelle, ausgefallen, ort, bemerkung, notizen)
      values (${plan.id}, ${t.datum}, ${t.uhrzeit ?? null}, ${t.dauerMinuten ?? null}, ${t.kategorieId}, 'manuell',
              ${t.ausgefallen ?? false}, ${t.ort ?? null}, ${t.bemerkung ?? null}, ${t.notizen ?? null})
      returning id`), "Termin");
    return NextResponse.json({ id: neu.id }, { status: 201 });
  });
}
