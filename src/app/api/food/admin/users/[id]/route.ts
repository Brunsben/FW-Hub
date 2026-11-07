import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { withFoodScope } from "@/lib/db/scoped";
import { kameraden } from "@/lib/db/schema";
import { requireFoodSession } from "@/lib/food-auth";
import { logFoodAdmin, setKartenId } from "@/lib/food-utils";
import {
  PG_INSUFFICIENT_PRIVILEGE,
  PG_NO_DATA_FOUND,
  PG_UNIQUE_VIOLATION,
  pgErrorCode,
} from "@/lib/db/pg-error";

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
  const kameradId = parseInt(id, 10);
  if (Number.isNaN(kameradId)) {
    return NextResponse.json({ error: "Ungültige id" }, { status: 400 });
  }

  const [user] = await withFoodScope(
    { kameradId: session.kameradId, foodRolle: session.foodRole },
    (tx) =>
      tx
        .select(kameradSelection)
        .from(kameraden)
        .where(eq(kameraden.id, kameradId))
        .limit(1),
  );

  if (!user) {
    return NextResponse.json(
      { error: "Kamerad nicht gefunden" },
      { status: 404 },
    );
  }

  return NextResponse.json({ user });
}

// Nur FoodBot-relevante Felder (karten_id) editierbar. Geschrieben wird
// ausschließlich über core.set_karten_id (ändert nur karten_id/updated_at).
// Name/Personalnummer/Rollen gehören zu core/PSA. DELETE entfällt:
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
  if (Number.isNaN(kameradId)) {
    return NextResponse.json({ error: "Ungültige id" }, { status: 400 });
  }
  const body = await req.json();

  if (!("card_id" in body)) {
    return NextResponse.json(
      { error: "Keine editierbaren Felder übergeben (card_id)" },
      { status: 400 },
    );
  }

  try {
    const updated = await withFoodScope(
      { kameradId: session.kameradId, foodRolle: session.foodRole },
      async (tx) => {
        await setKartenId(
          tx,
          kameradId,
          body.card_id ? String(body.card_id) : null,
        );
        const [row] = await tx
          .select(kameradSelection)
          .from(kameraden)
          .where(eq(kameraden.id, kameradId))
          .limit(1);
        return row;
      },
    );

    await logFoodAdmin(
      session.kameradName,
      "Karten-ID aktualisiert",
      `${updated.vorname} ${updated.name}`,
    );

    return NextResponse.json({ success: true, user: updated });
  } catch (e) {
    const code = pgErrorCode(e);
    if (code === PG_UNIQUE_VIOLATION) {
      return NextResponse.json(
        { error: "Karten-ID ist bereits einem anderen Kameraden zugeordnet" },
        { status: 409 },
      );
    }
    if (code === PG_INSUFFICIENT_PRIVILEGE) {
      return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 });
    }
    if (code === PG_NO_DATA_FOUND) {
      return NextResponse.json(
        { error: "Kamerad nicht gefunden" },
        { status: 404 },
      );
    }
    console.error("Food Karten-ID-Update fehlgeschlagen:", e);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
