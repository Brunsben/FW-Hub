import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { kameraden } from "@/lib/db/schema";
import { requireFoodSession } from "@/lib/food-auth";
import { logFoodAdmin } from "@/lib/food-utils";

const kameradSelection = {
  id: kameraden.id,
  vorname: kameraden.vorname,
  name: kameraden.name,
  personalnummer: kameraden.personalnummer,
  kartenId: kameraden.kartenId,
  aktiv: kameraden.aktiv,
  foodRolle: kameraden.foodRolle,
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireFoodSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }
  if (!session.isAdmin) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 });
  }

  const { id } = await params;
  const [user] = await db
    .select(kameradSelection)
    .from(kameraden)
    .where(eq(kameraden.id, parseInt(id, 10)))
    .limit(1);

  if (!user) {
    return NextResponse.json(
      { error: "Kamerad nicht gefunden" },
      { status: 404 },
    );
  }

  return NextResponse.json({ user });
}

// Nur FoodBot-relevante Felder (karten_id) editierbar. Name/Personalnummer
// gehören zu core/PSA und werden hier NICHT verändert. DELETE entfällt:
// core.kameraden wird nie aus FoodBot heraus gelöscht.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireFoodSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }
  if (!session.isAdmin) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 });
  }

  const { id } = await params;
  const kameradId = parseInt(id, 10);
  const body = await req.json();

  const [existing] = await db
    .select(kameradSelection)
    .from(kameraden)
    .where(eq(kameraden.id, kameradId))
    .limit(1);
  if (!existing) {
    return NextResponse.json(
      { error: "Kamerad nicht gefunden" },
      { status: 404 },
    );
  }

  if (!("card_id" in body)) {
    return NextResponse.json(
      { error: "Keine editierbaren Felder übergeben (card_id)" },
      { status: 400 },
    );
  }

  try {
    const [updated] = await db
      .update(kameraden)
      .set({
        kartenId: body.card_id ? String(body.card_id) : null,
        updatedAt: new Date(),
      })
      .where(eq(kameraden.id, kameradId))
      .returning(kameradSelection);

    await logFoodAdmin(
      session.kameradName,
      "Karten-ID aktualisiert",
      `${updated.vorname} ${updated.name}`,
    );

    return NextResponse.json({ success: true, user: updated });
  } catch {
    // Partieller Unique-Index auf core.kameraden.karten_id.
    return NextResponse.json(
      { error: "Karten-ID ist bereits einem anderen Kameraden zugeordnet" },
      { status: 409 },
    );
  }
}
