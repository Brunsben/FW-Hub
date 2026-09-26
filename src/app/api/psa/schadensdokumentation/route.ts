import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { psaAusruestungstuecke, psaSchadensdokumentation } from "@/lib/db/schema";
import { requirePsaSession } from "@/lib/psa-auth";
import { logChange, typNameByStueck } from "@/lib/psa-changelog";

function toIntOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function toStrOrNull(v: unknown): string | null {
  return v == null || v === "" ? null : String(v);
}

export async function GET(req: NextRequest) {
  const session = await requirePsaSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const conditions = [];

  const tueckId = toIntOrNull(params.get("ausruestungstueckId"));
  if (tueckId !== null)
    conditions.push(eq(psaSchadensdokumentation.ausruestungstueckId, tueckId));

  // Schaden hat keine eigene kamerad_id — User werden über den Träger des
  // zugehörigen Ausrüstungsstücks eingeschränkt (eigene Ausrüstung).
  if (session.isUser)
    conditions.push(eq(psaAusruestungstuecke.kameradId, session.kameradId));

  const schaeden = await db
    .select({
      id: psaSchadensdokumentation.id,
      ausruestungstueckId: psaSchadensdokumentation.ausruestungstueckId,
      datum: psaSchadensdokumentation.datum,
      beschreibung: psaSchadensdokumentation.beschreibung,
      foto: psaSchadensdokumentation.foto,
      erstelltVon: psaSchadensdokumentation.erstelltVon,
      createdAt: psaSchadensdokumentation.createdAt,
    })
    .from(psaSchadensdokumentation)
    .leftJoin(
      psaAusruestungstuecke,
      eq(psaAusruestungstuecke.id, psaSchadensdokumentation.ausruestungstueckId),
    )
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(psaSchadensdokumentation.datum));

  return NextResponse.json({ schaeden });
}

export async function POST(req: NextRequest) {
  const session = await requirePsaSession();
  if (!session?.canEdit) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 });
  }

  const body = await req.json();
  const ausruestungstueckId = toIntOrNull(body.ausruestungstueckId);
  if (ausruestungstueckId === null) {
    return NextResponse.json(
      { error: "ausruestungstueckId ist erforderlich" },
      { status: 400 },
    );
  }
  // Original erzwingt ein Foto ("Bitte ein Foto aufnehmen").
  const foto = toStrOrNull(body.foto);
  if (!foto) {
    return NextResponse.json({ error: "foto ist erforderlich" }, { status: 400 });
  }

  const [schaden] = await db
    .insert(psaSchadensdokumentation)
    .values({
      ausruestungstueckId,
      datum: toStrOrNull(body.datum),
      beschreibung: toStrOrNull(body.beschreibung),
      foto,
      erstelltVon: session.kameradId,
    })
    .returning();

  const typName = await typNameByStueck(ausruestungstueckId);
  await logChange(
    session,
    "Schadensdokumentation",
    "Erstellt",
    `${typName} – ${toStrOrNull(body.beschreibung) ?? "Foto"}`,
  );

  return NextResponse.json({ schaden }, { status: 201 });
}
