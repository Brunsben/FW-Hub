import { NextResponse } from "next/server";
import { anzeigeRoute } from "@/lib/dienstplan/anzeige";
import { fehler } from "@/lib/dienstplan/route";
import { ladePlan, planEtag } from "@/lib/dienstplan/plan";

type Ctx = { params: Promise<{ jahr: string }> };

// Präsentation ohne Login (Token-Route, Spec 7.3). Token im Header
// X-Dienstplan-Anzeige. Antwort wie GET /api/dienstplan/plaene/[jahr], aber
// ohne Notizen; dazu gueltigBis des Links. ETag/304 für das Polling.
export async function GET(req: Request, { params }: Ctx) {
  const jahr = Number((await params).jahr);
  if (!Number.isInteger(jahr) || jahr < 2000 || jahr > 2100) return fehler(400, "Ungültiges Jahr");
  return anzeigeRoute(req, jahr, async ({ tx, plan, gueltigBis }) => {
    const etag = planEtag(plan);
    const headers = { ETag: etag, "Cache-Control": "private, no-cache", "Referrer-Policy": "no-referrer" };
    if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
    const { organisationId, ...p } = plan;
    const daten = await ladePlan(tx, p, organisationId);
    const termine = daten.termine.map((t) => ({ ...t, notizen: null }));
    return NextResponse.json({ ...daten, termine, gueltigBis }, { headers });
  });
}
