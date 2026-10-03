import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { kameraden } from "@/lib/db/schema";
import { requireFoodSession } from "@/lib/food-auth";
import { logFoodAdmin } from "@/lib/food-utils";

// CSV-Import gegen core.kameraden: Zeilen werden über die Personalnummer einem
// bestehenden Kameraden zugeordnet; aktualisiert wird NUR die karten_id.
// Es werden KEINE neuen Kameraden angelegt (Anlage läuft über PSA). Zeilen
// ohne passenden Kameraden werden übersprungen und als Fehler zurückgegeben.
export async function POST(req: NextRequest) {
  const session = await requireFoodSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }
  if (!session.isAdmin) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { csv } = body;

    if (!csv || typeof csv !== "string") {
      return NextResponse.json(
        { error: "CSV-Daten erforderlich" },
        { status: 400 },
      );
    }

    const lines = csv
      .split("\n")
      .map((l: string) => l.trim())
      .filter(
        (l: string) => l && !l.startsWith("name") && !l.startsWith("Name"),
      );

    let updated = 0;
    const errors: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      // Spalten der Vorlage: Name, Personalnummer, KartenID.
      const parts = lines[i].split(/[,;]/).map((p: string) => p.trim());
      const [, personalNumber, cardId] = parts;

      if (!personalNumber) {
        errors.push(`Zeile ${i + 1}: Personalnummer fehlt`);
        continue;
      }
      if (!cardId) {
        errors.push(`Zeile ${i + 1}: KartenID fehlt`);
        continue;
      }

      const [kamerad] = await db
        .select({ id: kameraden.id })
        .from(kameraden)
        .where(eq(kameraden.personalnummer, personalNumber))
        .limit(1);

      if (!kamerad) {
        errors.push(
          `Zeile ${i + 1}: Kein Kamerad mit Personalnummer ${personalNumber}`,
        );
        continue;
      }

      try {
        await db
          .update(kameraden)
          .set({ kartenId: cardId, updatedAt: new Date() })
          .where(eq(kameraden.id, kamerad.id));
        updated++;
      } catch {
        // Partieller Unique-Index auf core.kameraden.karten_id.
        errors.push(
          `Zeile ${i + 1}: KartenID ${cardId} bereits einem anderen Kameraden zugeordnet`,
        );
      }
    }

    await logFoodAdmin(
      session.kameradName,
      "CSV-Import (Karten-IDs)",
      `Aktualisiert: ${updated}, Fehler: ${errors.length}`,
    );

    return NextResponse.json({ success: true, updated, errors });
  } catch (error) {
    console.error("Food user import error:", error);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
