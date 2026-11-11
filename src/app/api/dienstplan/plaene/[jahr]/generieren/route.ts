import { NextResponse } from "next/server";
import { dienstplanRoute, DpFehler, leseJahrParam } from "@/lib/dienstplan/route";
import { generiereTermine, planOder404 } from "@/lib/dienstplan/plan";

// Generator erneut ausführen (Planer und Admin, nur im Entwurf). Idempotent:
// legt nur fehlende Rhythmus-Termine an, ändert und löscht nichts (Spec 5.3).
export async function POST(_req: Request, { params }: { params: Promise<{ jahr: string }> }) {
  return dienstplanRoute("Planer", async ({ s, tx }) => {
    const plan = await planOder404(tx, s.organisationId, leseJahrParam((await params).jahr));
    if (plan.status !== "entwurf") throw new DpFehler(409, "Der Generator läuft nur für Entwürfe");
    return NextResponse.json({ generiert: await generiereTermine(tx, plan, s.organisationId) });
  });
}
