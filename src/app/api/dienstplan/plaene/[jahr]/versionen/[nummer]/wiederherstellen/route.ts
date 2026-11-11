import { NextResponse } from "next/server";
import { leseVersionNummer } from "@/lib/dienstplan/eingabe";
import { dienstplanRoute, DpFehler, leseJahrParam } from "@/lib/dienstplan/route";
import { planOder404 } from "@/lib/dienstplan/plan";
import { stelleWiederHer } from "@/lib/dienstplan/versionen-db";

type Ctx = { params: Promise<{ jahr: string; nummer: string }> };

// Version wiederherstellen (Spec 8, nur Dienstplan-Admin): Der Stand der Version
// wird zum neuen Entwurf. Vorher wird der aktuelle Stand als Version gesichert;
// keine Version wird gelöscht. Ein freigegebener Plan wird dabei Entwurf
// (Mitglieder sehen ihn bis zur nächsten Freigabe nicht).
export async function POST(_req: Request, { params }: Ctx) {
  return dienstplanRoute("Admin", async ({ s, tx }) => {
    const p = await params;
    const plan = await planOder404(tx, s.organisationId, leseJahrParam(p.jahr));
    const nummer = leseVersionNummer(p.nummer, false);
    if (typeof nummer !== "number") throw new DpFehler(400, "Ungültige Versionsnummer");
    const ergebnis = await stelleWiederHer(tx, plan, s.organisationId, s.kameradId, nummer);
    return NextResponse.json({ ...ergebnis, plan: await planOder404(tx, s.organisationId, plan.jahr) });
  });
}
