import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { psaNormen } from "@/lib/db/schema";
import { requirePsaSession } from "@/lib/psa-auth";
import { logChange } from "@/lib/psa-changelog";

function toIntOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function toStrOrNull(v: unknown): string | null {
  return v == null || v === "" ? null : String(v);
}

export async function GET() {
  const session = await requirePsaSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const normen = await db
    .select()
    .from(psaNormen)
    .orderBy(asc(psaNormen.ausruestungstypKategorie), asc(psaNormen.bezeichnung));

  return NextResponse.json({ normen });
}

export async function POST(req: NextRequest) {
  const session = await requirePsaSession();
  if (!session?.canEdit) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 });
  }

  const body = await req.json();

  const [norm] = await db
    .insert(psaNormen)
    .values({
      bezeichnung: toStrOrNull(body.bezeichnung),
      ausruestungstypKategorie: toStrOrNull(body.ausruestungstypKategorie),
      normbezeichnung: toStrOrNull(body.normbezeichnung),
      url: toStrOrNull(body.url),
      pruefintervallMonate: toIntOrNull(body.pruefintervallMonate),
      maxLebensdauerJahre: toIntOrNull(body.maxLebensdauerJahre),
      maxWaeschen: toIntOrNull(body.maxWaeschen),
      beschreibung: toStrOrNull(body.beschreibung),
    })
    .returning();

  await logChange(session, "Normen", "Erstellt", norm.bezeichnung);

  return NextResponse.json({ norm }, { status: 201 });
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
  if ("bezeichnung" in body) update.bezeichnung = toStrOrNull(body.bezeichnung);
  if ("ausruestungstypKategorie" in body)
    update.ausruestungstypKategorie = toStrOrNull(body.ausruestungstypKategorie);
  if ("normbezeichnung" in body)
    update.normbezeichnung = toStrOrNull(body.normbezeichnung);
  if ("url" in body) update.url = toStrOrNull(body.url);
  if ("pruefintervallMonate" in body)
    update.pruefintervallMonate = toIntOrNull(body.pruefintervallMonate);
  if ("maxLebensdauerJahre" in body)
    update.maxLebensdauerJahre = toIntOrNull(body.maxLebensdauerJahre);
  if ("maxWaeschen" in body)
    update.maxWaeschen = toIntOrNull(body.maxWaeschen);
  if ("beschreibung" in body)
    update.beschreibung = toStrOrNull(body.beschreibung);

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "Keine Felder zum Aktualisieren" },
      { status: 400 },
    );
  }
  update.updatedAt = new Date();

  const [norm] = await db
    .update(psaNormen)
    .set(update)
    .where(eq(psaNormen.id, id))
    .returning();

  if (!norm) {
    return NextResponse.json({ error: "Norm nicht gefunden" }, { status: 404 });
  }

  await logChange(session, "Normen", "Bearbeitet", norm.bezeichnung);

  return NextResponse.json({ norm });
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
    .delete(psaNormen)
    .where(eq(psaNormen.id, id))
    .returning({ id: psaNormen.id, bezeichnung: psaNormen.bezeichnung });

  if (!deleted) {
    return NextResponse.json({ error: "Norm nicht gefunden" }, { status: 404 });
  }

  await logChange(session, "Normen", "Gelöscht", deleted.bezeichnung);

  return NextResponse.json({ id: deleted.id });
}
