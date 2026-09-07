import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { funkRicLibrary } from "@/lib/db/schema";
import { requireFunkSession } from "@/lib/funk-auth";

export async function GET() {
  const session = await requireFunkSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const rics = await db
    .select()
    .from(funkRicLibrary)
    .orderBy(asc(funkRicLibrary.ricNumber));

  return NextResponse.json({ rics });
}

export async function POST(req: NextRequest) {
  const session = await requireFunkSession();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 });
  }

  const body = await req.json();
  const ricNumber = body.ricNumber != null ? Number(body.ricNumber) : null;
  if (ricNumber === null || Number.isNaN(ricNumber)) {
    return NextResponse.json(
      { error: "ricNumber (Zahl) erforderlich" },
      { status: 400 },
    );
  }

  const existing = await db.query.funkRicLibrary.findFirst({
    where: eq(funkRicLibrary.ricNumber, ricNumber),
  });
  if (existing) {
    return NextResponse.json(
      { error: "RIC-Nummer existiert bereits" },
      { status: 409 },
    );
  }

  const [ric] = await db
    .insert(funkRicLibrary)
    .values({
      ricNumber,
      callsign: body.callsign ? String(body.callsign) : null,
      location: body.location ? String(body.location) : null,
      description: body.description ? String(body.description) : null,
      activeFrom: body.activeFrom ? String(body.activeFrom) : null,
      activeTo: body.activeTo ? String(body.activeTo) : null,
      notes: body.notes ? String(body.notes) : null,
    })
    .returning();

  return NextResponse.json({ ric }, { status: 201 });
}
