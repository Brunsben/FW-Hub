import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { withFoodScope } from "@/lib/db/scoped";
import { kameraden } from "@/lib/db/schema";
import { requireFoodSession } from "@/lib/food-auth";

// Liste direkt aus core.kameraden (die alte users-Tabelle entfällt).
// POST entfällt: Kameraden-Anlage läuft über PSA, nicht FoodBot-eigen.
// core.kameraden liegt hinter RLS → Lesen im Food-Admin-Scope.
export async function GET() {
  const session = await requireFoodSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }
  if (!session.isAdmin) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 });
  }

  const users = await withFoodScope(
    { kameradId: session.kameradId, foodRolle: session.foodRole },
    (tx) =>
      tx
        .select({
          id: kameraden.id,
          vorname: kameraden.vorname,
          name: kameraden.name,
          personalnummer: kameraden.personalnummer,
          kartenId: kameraden.kartenId,
          aktiv: kameraden.aktiv,
          foodRolle: kameraden.foodRolle,
        })
        .from(kameraden)
        .orderBy(asc(kameraden.name), asc(kameraden.vorname)),
  );

  return NextResponse.json({ users });
}
