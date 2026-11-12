import { NextResponse } from "next/server";
import { pruefeVersion } from "@/lib/dienstplan/eingabe";
import { dienstplanRoute, DpFehler, leseBody, leseJahrParam } from "@/lib/dienstplan/route";
import { planOder404, speichereVersion } from "@/lib/dienstplan/plan";
import { listeVersionen } from "@/lib/dienstplan/versionen-db";

type Ctx = { params: Promise<{ jahr: string }> };

// Versionen eines Plans (Spec 8, Phase 9). Planer und Admin.
//   GET  Liste (neueste zuerst): nummer, anlass, bezeichnung, erstellt am/von, Anzahl Termine
//   POST { bezeichnung } speichert den aktuellen Stand als manuelle Version
//        (z. B. "Stand nach GF-Sitzung"). Versionen sind unveränderlich.
export async function GET(_req: Request, { params }: Ctx) {
  return dienstplanRoute("Planer", async ({ s, tx }) => {
    const plan = await planOder404(tx, s.organisationId, leseJahrParam((await params).jahr));
    return NextResponse.json({ plan, versionen: await listeVersionen(tx, plan.id) });
  });
}

export async function POST(req: Request, { params }: Ctx) {
  return dienstplanRoute("Planer", async ({ s, tx }) => {
    const plan = await planOder404(tx, s.organisationId, leseJahrParam((await params).jahr));
    const e = pruefeVersion(await leseBody(req));
    if (!e.ok) throw new DpFehler(400, e.fehler);
    const v = await speichereVersion(tx, plan, s.kameradId, "manuell", e.daten.bezeichnung);
    return NextResponse.json({ nummer: v.nummer }, { status: 201 });
  });
}
