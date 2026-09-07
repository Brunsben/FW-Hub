import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { funkAuditLog } from "@/lib/db/schema";
import { requireFunkSession } from "@/lib/funk-auth";

export async function GET(req: NextRequest) {
  const session = await requireFunkSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const deviceId = params.get("deviceId");
  const memberParam = params.get("memberId");
  const memberId = memberParam ? Number(memberParam) : null;

  // Nicht-Admins dürfen nur ihre eigenen Einträge sehen.
  if (!session.isAdmin && memberId !== null && memberId !== session.kameradId) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 });
  }

  const conditions = [];
  if (deviceId) conditions.push(eq(funkAuditLog.deviceId, deviceId));
  const effectiveMember = session.isAdmin ? memberId : session.kameradId;
  if (effectiveMember !== null)
    conditions.push(eq(funkAuditLog.ownerId, effectiveMember));

  const entries = await db
    .select()
    .from(funkAuditLog)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(funkAuditLog.issuedAt));

  return NextResponse.json({ entries });
}
