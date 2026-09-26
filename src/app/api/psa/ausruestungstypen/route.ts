import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { psaAusruestungstypen } from "@/lib/db/schema";
import { requirePsaSession } from "@/lib/psa-auth";

function toIntOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

export async function GET() {
  const session = await requirePsaSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  // Katalog: für alle angemeldeten PSA-Sessions lesbar.
  const typen = await db
    .select()
    .from(psaAusruestungstypen)
    .orderBy(asc(psaAusruestungstypen.bezeichnung));

  return NextResponse.json({ typen });
}

export async function POST(req: NextRequest) {
  const session = await requirePsaSession();
  if (!session?.canEdit) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 });
  }

  const body = await req.json();
  if (!body.bezeichnung) {
    return NextResponse.json(
      { error: "bezeichnung ist erforderlich" },
      { status: 400 },
    );
  }

  const [typ] = await db
    .insert(psaAusruestungstypen)
    .values({
      bezeichnung: String(body.bezeichnung),
      typ: body.typ ? String(body.typ) : null,
      pruefintervallMonate: toIntOrNull(body.pruefintervallMonate),
      maxLebensdauerJahre: toIntOrNull(body.maxLebensdauerJahre),
      maxWaeschen: toIntOrNull(body.maxWaeschen),
      norm: body.norm ? String(body.norm) : null,
      foto: body.foto ? String(body.foto) : null,
    })
    .returning();

  return NextResponse.json({ typ }, { status: 201 });
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
  if ("bezeichnung" in body) update.bezeichnung = String(body.bezeichnung);
  if ("typ" in body) update.typ = body.typ ? String(body.typ) : null;
  if ("pruefintervallMonate" in body)
    update.pruefintervallMonate = toIntOrNull(body.pruefintervallMonate);
  if ("maxLebensdauerJahre" in body)
    update.maxLebensdauerJahre = toIntOrNull(body.maxLebensdauerJahre);
  if ("maxWaeschen" in body)
    update.maxWaeschen = toIntOrNull(body.maxWaeschen);
  if ("norm" in body) update.norm = body.norm ? String(body.norm) : null;
  if ("foto" in body) update.foto = body.foto ? String(body.foto) : null;

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "Keine Felder zum Aktualisieren" },
      { status: 400 },
    );
  }
  update.updatedAt = new Date();

  const [typ] = await db
    .update(psaAusruestungstypen)
    .set(update)
    .where(eq(psaAusruestungstypen.id, id))
    .returning();

  if (!typ) {
    return NextResponse.json({ error: "Typ nicht gefunden" }, { status: 404 });
  }

  return NextResponse.json({ typ });
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
    .delete(psaAusruestungstypen)
    .where(eq(psaAusruestungstypen.id, id))
    .returning({ id: psaAusruestungstypen.id });

  if (!deleted) {
    return NextResponse.json({ error: "Typ nicht gefunden" }, { status: 404 });
  }

  return NextResponse.json({ id: deleted.id });
}
