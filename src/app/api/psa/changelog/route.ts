import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { psaChangelog } from "@/lib/db/schema";
import { requirePsaSession } from "@/lib/psa-auth";

// Nur Leseansicht für Admin/Kleiderwart. Einträge entstehen intern bei
// anderen Mutationen, es gibt bewusst keinen POST von außen.
export async function GET(req: NextRequest) {
  const session = await requirePsaSession();
  if (!session?.canEdit) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 });
  }

  const limitRaw = Number(req.nextUrl.searchParams.get("limit"));
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 1000
      ? limitRaw
      : 200;

  const changelog = await db
    .select()
    .from(psaChangelog)
    .orderBy(desc(psaChangelog.zeitpunkt))
    .limit(limit);

  return NextResponse.json({ changelog });
}
