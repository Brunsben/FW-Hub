import { NextResponse } from "next/server";
import { standText } from "@/lib/dienstplan/export";
import { dateiAntwort, ladeExportTermine } from "@/lib/dienstplan/export-db";
import { dienstplanExcel } from "@/lib/dienstplan/excel";
import { ladeKategorien, planOder404 } from "@/lib/dienstplan/plan";
import { dienstplanRoute, leseJahrParam } from "@/lib/dienstplan/route";

type Ctx = { params: Promise<{ jahr: string }> };

// Excel-Export (Spec 9.1), Planer und Admin. Auch für Entwürfe (Titel trägt
// dann „(Entwurf)“). Nicht protokolliert (kein Änderungsexport).
export async function POST(_req: Request, { params }: Ctx) {
  return dienstplanRoute("Planer", async ({ s, tx }) => {
    const plan = await planOder404(tx, s.organisationId, leseJahrParam((await params).jahr));
    const [termine, kategorien] = await Promise.all([ladeExportTermine(tx, plan, s.organisationId), ladeKategorien(tx, s.organisationId)]);
    const bytes = await dienstplanExcel(plan.jahr, termine, kategorien.filter((k) => k.aktiv || termine.some((t) => t.kategorieKuerzel === k.kuerzel)),
      standText(new Date().toISOString()), plan.status !== "freigegeben");
    const heute = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return NextResponse.json(dateiAntwort(`dienstplan-${plan.jahr}-${heute}.xlsx`,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes, { anzahl: termine.length }));
  });
}
