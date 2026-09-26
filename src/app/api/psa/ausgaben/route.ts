import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { psaAusgaben, psaAusruestungstuecke } from "@/lib/db/schema";
import { requirePsaSession } from "@/lib/psa-auth";
import { kameradName, logChange, typNameByStueck } from "@/lib/psa-changelog";

function toIntOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function toStrOrNull(v: unknown): string | null {
  return v == null || v === "" ? null : String(v);
}

const heute = () => new Date().toISOString().slice(0, 10);

export async function GET(req: NextRequest) {
  const session = await requirePsaSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const conditions = [];

  const tueckId = toIntOrNull(params.get("ausruestungstueckId"));
  if (tueckId !== null)
    conditions.push(eq(psaAusgaben.ausruestungstueckId, tueckId));

  if (session.isUser) {
    conditions.push(eq(psaAusgaben.kameradId, session.kameradId));
  } else {
    const kameradId = toIntOrNull(params.get("kameradId"));
    if (kameradId !== null)
      conditions.push(eq(psaAusgaben.kameradId, kameradId));
  }

  const ausgaben = await db
    .select()
    .from(psaAusgaben)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(psaAusgaben.ausgabedatum));

  return NextResponse.json({ ausgaben });
}

export async function POST(req: NextRequest) {
  const session = await requirePsaSession();
  if (!session?.canEdit) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 });
  }

  const body = await req.json();
  const ausruestungstueckId = toIntOrNull(body.ausruestungstueckId);
  const kameradId = toIntOrNull(body.kameradId);
  if (ausruestungstueckId === null || kameradId === null) {
    return NextResponse.json(
      { error: "ausruestungstueckId und kameradId sind erforderlich" },
      { status: 400 },
    );
  }

  // Ausgabe: Stück dem Empfänger zuordnen + auf "Ausgegeben" setzen und den
  // Ausgaben-Datensatz anlegen — atomar in einer Transaktion.
  const ausgabe = await db.transaction(async (tx) => {
    await tx
      .update(psaAusruestungstuecke)
      .set({ kameradId, status: "Ausgegeben", updatedAt: new Date() })
      .where(eq(psaAusruestungstuecke.id, ausruestungstueckId));

    const [row] = await tx
      .insert(psaAusgaben)
      .values({
        ausruestungstueckId,
        kameradId,
        ausgabedatum: toStrOrNull(body.ausgabedatum) ?? heute(),
        notizen: toStrOrNull(body.notizen),
      })
      .returning();
    return row;
  });

  const typName = await typNameByStueck(ausruestungstueckId);
  const empfaenger = await kameradName(kameradId);
  await logChange(session, "Ausgaben", "Ausgegeben", `${typName} → ${empfaenger}`);

  return NextResponse.json({ ausgabe }, { status: 201 });
}

// Rückgabe: setzt das Rueckgabedatum einer offenen Ausgabe.
export async function PATCH(req: NextRequest) {
  const session = await requirePsaSession();
  if (!session?.canEdit) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 });
  }

  const body = await req.json();
  const id = Number(body.id);
  if (!id || Number.isNaN(id)) {
    return NextResponse.json({ error: "id erforderlich" }, { status: 400 });
  }

  // Rückgabe: Rueckgabedatum setzen und das zugehörige Stück zurück ins Lager
  // (kamerad_id = null, Status "Lager") — atomar in einer Transaktion.
  const ausgabe = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(psaAusgaben)
      .set({
        rueckgabedatum: toStrOrNull(body.rueckgabedatum) ?? heute(),
        updatedAt: new Date(),
      })
      .where(eq(psaAusgaben.id, id))
      .returning();

    if (row?.ausruestungstueckId != null) {
      await tx
        .update(psaAusruestungstuecke)
        .set({ kameradId: null, status: "Lager", updatedAt: new Date() })
        .where(eq(psaAusruestungstuecke.id, row.ausruestungstueckId));
    }
    return row;
  });

  if (!ausgabe) {
    return NextResponse.json(
      { error: "Ausgabe nicht gefunden" },
      { status: 404 },
    );
  }

  const typName = await typNameByStueck(ausgabe.ausruestungstueckId);
  await logChange(session, "Ausgaben", "Zurückgegeben", typName);

  return NextResponse.json({ ausgabe });
}
