import { NextResponse } from "next/server";
import { listeLaeufe } from "@/lib/dienstplan/export-db";
import { planOder404 } from "@/lib/dienstplan/plan";
import { dienstplanRoute, leseJahrParam } from "@/lib/dienstplan/route";

type Ctx = { params: Promise<{ jahr: string }> };

// Protokoll der Exporte eines Plans (neueste zuerst, höchstens 50). Planer und Admin.
export async function GET(_req: Request, { params }: Ctx) {
  return dienstplanRoute("Planer", async ({ s, tx }) => {
    const plan = await planOder404(tx, s.organisationId, leseJahrParam((await params).jahr));
    return NextResponse.json({ laeufe: await listeLaeufe(tx, plan.id) });
  });
}
