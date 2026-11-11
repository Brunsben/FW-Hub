import type { NextRequest } from "next/server";
import { standText } from "@/lib/dienstplan/export";
import { leseHalbjahr } from "@/lib/dienstplan/export-db";
import { dateiInline, ladeDruckdaten } from "@/lib/dienstplan/druck-db";
import { dienstplanPdf } from "@/lib/dienstplan/pdf";
import { planOder404 } from "@/lib/dienstplan/plan";
import { dienstplanRoute, leseJahrParam } from "@/lib/dienstplan/route";

type Ctx = { params: Promise<{ jahr: string }> };

// PDF zum Ausdrucken (Spec 9.2): GET ?halbjahr=1|2 (ohne: beide Halbjahre, je
// eine Seite). Mitglieder nur freigegebene Pläne (RLS), Planer auch Entwürfe
// (Titel „(Entwurf)“). Antwort inline, der Browser zeigt das PDF an.
export async function GET(req: NextRequest, { params }: Ctx) {
  return dienstplanRoute("Mitglied", async ({ s, tx }) => {
    const plan = await planOder404(tx, s.organisationId, leseJahrParam((await params).jahr));
    const halbjahr = leseHalbjahr(req.nextUrl.searchParams.get("halbjahr"));
    const d = await ladeDruckdaten(tx, plan, s.organisationId);
    const bytes = await dienstplanPdf({
      jahr: plan.jahr, halbjahr, zeilen: { h1: d.h1, h2: d.h2 }, kategorien: d.kategorien,
      stand: standText(new Date().toISOString()), organisation: d.organisation, entwurf: plan.status !== "freigegeben",
    });
    return dateiInline(bytes, "application/pdf", `dienstplan-${plan.jahr}${halbjahr ? `-h${halbjahr}` : ""}.pdf`);
  });
}
