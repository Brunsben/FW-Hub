import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { psaPruefungen } from "@/lib/db/schema";
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
    conditions.push(eq(psaPruefungen.ausruestungstueckId, tueckId));

  if (session.isUser) {
    conditions.push(eq(psaPruefungen.kameradId, session.kameradId));
  } else {
    const kameradId = toIntOrNull(params.get("kameradId"));
    if (kameradId !== null)
      conditions.push(eq(psaPruefungen.kameradId, kameradId));
  }

  const pruefungen = await db
    .select()
    .from(psaPruefungen)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(psaPruefungen.datum));

  return NextResponse.json({ pruefungen });
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

  const [pruefung] = await db
    .insert(psaPruefungen)
    .values({
      ausruestungstueckId,
      kameradId: toIntOrNull(body.kameradId),
      datum: toStrOrNull(body.datum),
      ergebnis: toStrOrNull(body.ergebnis),
      pruefer: toStrOrNull(body.pruefer),
      naechstePruefung: toStrOrNull(body.naechstePruefung),
      notizen: toStrOrNull(body.notizen),
      foto: toStrOrNull(body.foto),
    })
    .returning();

  const typName = await typNameByStueck(ausruestungstueckId);
  await logChange(
    session,
    "Prüfungen",
    "Geprüft",
    `${typName} – ${toStrOrNull(body.ergebnis) ?? ""}`,
  );

  return NextResponse.json({ pruefung }, { status: 201 });
}
