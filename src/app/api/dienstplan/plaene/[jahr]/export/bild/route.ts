import type { NextRequest } from "next/server";
import { standText } from "@/lib/dienstplan/export";
import { leseHalbjahr } from "@/lib/dienstplan/export-db";
import { dienstplanBild } from "@/lib/dienstplan/bild";
import { dateiInline, ladeDruckdaten } from "@/lib/dienstplan/druck-db";
import { planOder404 } from "@/lib/dienstplan/plan";
import { dienstplanRoute, DpFehler, leseJahrParam } from "@/lib/dienstplan/route";

type Ctx = { params: Promise<{ jahr: string }> };

// Bild für das Smartphone (Spec 9.3): GET ?halbjahr=1|2&thema=hell|dunkel&namen=0|1
// PNG 1290 × 2796, inline (auf dem Handy lange drücken → „Zu Fotos hinzufügen“).
// Mitglieder nur freigegebene Pläne (RLS).
export async function GET(req: NextRequest, { params }: Ctx) {
  return dienstplanRoute("Mitglied", async ({ s, tx }) => {
    const plan = await planOder404(tx, s.organisationId, leseJahrParam((await params).jahr));
    const q = req.nextUrl.searchParams;
    const halbjahr = leseHalbjahr(q.get("halbjahr"));
    if (halbjahr === null) throw new DpFehler(400, "halbjahr muss 1 oder 2 sein (ein Bild je Halbjahr)");
    const thema = q.get("thema") ?? "hell";
    if (thema !== "hell" && thema !== "dunkel") throw new DpFehler(400, "thema muss hell oder dunkel sein");
    const namen = q.get("namen") ?? "0";
    if (namen !== "0" && namen !== "1") throw new DpFehler(400, "namen muss 0 oder 1 sein");
    const d = await ladeDruckdaten(tx, plan, s.organisationId);
    const bytes = await dienstplanBild({
      jahr: plan.jahr, halbjahr, zeilen: halbjahr === 1 ? d.h1 : d.h2, kategorien: d.kategorien,
      stand: standText(new Date().toISOString()), dunkel: thema === "dunkel", mitNamen: namen === "1", entwurf: plan.status !== "freigegeben",
    });
    return dateiInline(bytes, "image/png", `dienstplan-${plan.jahr}-h${halbjahr}-${thema}.png`);
  });
}
