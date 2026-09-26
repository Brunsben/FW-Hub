import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { psaAusruestungstuecke } from "@/lib/db/schema";
import { requirePsaSession } from "@/lib/psa-auth";

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

  const typId = toIntOrNull(params.get("ausruestungstypId"));
  if (typId !== null)
    conditions.push(eq(psaAusruestungstuecke.ausruestungstypId, typId));

  const status = params.get("status");
  if (status) conditions.push(eq(psaAusruestungstuecke.status, status));

  if (session.isUser) {
    // User: unabhängig von Filtern immer nur eigene Stücke.
    conditions.push(eq(psaAusruestungstuecke.kameradId, session.kameradId));
  } else {
    const kameradId = toIntOrNull(params.get("kameradId"));
    if (kameradId !== null)
      conditions.push(eq(psaAusruestungstuecke.kameradId, kameradId));
  }

  const stuecke = await db
    .select()
    .from(psaAusruestungstuecke)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(psaAusruestungstuecke.createdAt));

  return NextResponse.json({ stuecke });
}

export async function POST(req: NextRequest) {
  const session = await requirePsaSession();
  if (!session?.canEdit) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 });
  }

  const body = await req.json();

  const [stueck] = await db
    .insert(psaAusruestungstuecke)
    .values({
      ausruestungstypId: toIntOrNull(body.ausruestungstypId),
      seriennummer: toStrOrNull(body.seriennummer),
      status: toStrOrNull(body.status),
      kaufdatum: toStrOrNull(body.kaufdatum),
      herstellungsdatum: toStrOrNull(body.herstellungsdatum),
      naechstePruefung: toStrOrNull(body.naechstePruefung),
      letztePruefung: toStrOrNull(body.letztePruefung),
      lebensendeDatum: toStrOrNull(body.lebensendeDatum),
      qrCode: toStrOrNull(body.qrCode),
      waescheAnzahl: toIntOrNull(body.waescheAnzahl) ?? 0,
      groesse: toStrOrNull(body.groesse),
      notizen: toStrOrNull(body.notizen),
      kameradId: toIntOrNull(body.kameradId),
    })
    .returning();

  return NextResponse.json({ stueck }, { status: 201 });
}

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

  const update: Record<string, unknown> = {};
  if ("ausruestungstypId" in body)
    update.ausruestungstypId = toIntOrNull(body.ausruestungstypId);
  if ("seriennummer" in body)
    update.seriennummer = toStrOrNull(body.seriennummer);
  if ("status" in body) update.status = toStrOrNull(body.status);
  if ("kaufdatum" in body) update.kaufdatum = toStrOrNull(body.kaufdatum);
  if ("herstellungsdatum" in body)
    update.herstellungsdatum = toStrOrNull(body.herstellungsdatum);
  if ("naechstePruefung" in body)
    update.naechstePruefung = toStrOrNull(body.naechstePruefung);
  if ("letztePruefung" in body)
    update.letztePruefung = toStrOrNull(body.letztePruefung);
  if ("lebensendeDatum" in body)
    update.lebensendeDatum = toStrOrNull(body.lebensendeDatum);
  if ("qrCode" in body) update.qrCode = toStrOrNull(body.qrCode);
  if ("waescheAnzahl" in body)
    update.waescheAnzahl = toIntOrNull(body.waescheAnzahl) ?? 0;
  if ("groesse" in body) update.groesse = toStrOrNull(body.groesse);
  if ("notizen" in body) update.notizen = toStrOrNull(body.notizen);
  if ("kameradId" in body) update.kameradId = toIntOrNull(body.kameradId);

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "Keine Felder zum Aktualisieren" },
      { status: 400 },
    );
  }
  update.updatedAt = new Date();

  const [stueck] = await db
    .update(psaAusruestungstuecke)
    .set(update)
    .where(eq(psaAusruestungstuecke.id, id))
    .returning();

  if (!stueck) {
    return NextResponse.json(
      { error: "Ausrüstungsstück nicht gefunden" },
      { status: 404 },
    );
  }

  return NextResponse.json({ stueck });
}

export async function DELETE(req: NextRequest) {
  const session = await requirePsaSession();
  if (!session?.canEdit) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 });
  }

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id || Number.isNaN(id)) {
    return NextResponse.json({ error: "id erforderlich" }, { status: 400 });
  }

  const [deleted] = await db
    .delete(psaAusruestungstuecke)
    .where(eq(psaAusruestungstuecke.id, id))
    .returning({ id: psaAusruestungstuecke.id });

  if (!deleted) {
    return NextResponse.json(
      { error: "Ausrüstungsstück nicht gefunden" },
      { status: 404 },
    );
  }

  return NextResponse.json({ id: deleted.id });
}
