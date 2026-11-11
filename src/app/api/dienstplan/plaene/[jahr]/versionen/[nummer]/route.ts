import { NextResponse } from "next/server";
import { leseVersionNummer } from "@/lib/dienstplan/eingabe";
import { dienstplanRoute, DpFehler, leseJahrParam } from "@/lib/dienstplan/route";
import { planOder404 } from "@/lib/dienstplan/plan";
import { ladeVersion } from "@/lib/dienstplan/versionen-db";

type Ctx = { params: Promise<{ jahr: string; nummer: string }> };

// Eine Version schreibgeschützt ansehen (Planer und Admin): Kopf und Abbild
// (Termine mit Themen und Verantwortlichen zum Zeitpunkt).
export async function GET(_req: Request, { params }: Ctx) {
  return dienstplanRoute("Planer", async ({ s, tx }) => {
    const p = await params;
    const plan = await planOder404(tx, s.organisationId, leseJahrParam(p.jahr));
    const nummer = leseVersionNummer(p.nummer, false);
    if (typeof nummer !== "number") throw new DpFehler(400, "Ungültige Versionsnummer");
    return NextResponse.json({ plan, version: await ladeVersion(tx, plan.id, nummer) });
  });
}
