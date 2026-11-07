import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { withFoodScope } from "@/lib/db/scoped";
import { kameraden } from "@/lib/db/schema";
import { requireFoodSession } from "@/lib/food-auth";
import { logFoodAdmin, setKartenId } from "@/lib/food-utils";
import {
  PG_INSUFFICIENT_PRIVILEGE,
  PG_UNIQUE_VIOLATION,
  pgErrorCode,
} from "@/lib/db/pg-error";

// Fehler mit Zeilenbezug, bricht die Import-Transaktion ab.
class ImportLineError extends Error {
  constructor(
    readonly line: number,
    readonly cardId: string,
    readonly cause: unknown,
  ) {
    super(`Zeile ${line}`);
  }
}

// CSV-Import gegen core.kameraden: Zeilen werden über die Personalnummer einem
// bestehenden Kameraden zugeordnet; aktualisiert wird NUR die karten_id, und
// zwar über core.set_karten_id. Es werden KEINE neuen Kameraden angelegt
// (Anlage läuft über PSA). Zeilen ohne passenden Kameraden werden übersprungen
// und als Fehler zurückgegeben.
//
// Atomar: Eine bereits vergebene Karten-ID bricht den gesamten Import ab
// (409), es wird dann nichts übernommen.
export async function POST(req: NextRequest) {
  const session = await requireFoodSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }
  if (!session.isAdmin) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 });
  }

  let csv: unknown;
  try {
    ({ csv } = await req.json());
  } catch {
    return NextResponse.json({ error: "Ungültiger Body" }, { status: 400 });
  }
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

  try {
    const { updated, errors } = await withFoodScope(
      { kameradId: session.kameradId, foodRolle: session.foodRole },
      async (tx) => {
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

          const [kamerad] = await tx
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
            await setKartenId(tx, kamerad.id, cardId);
          } catch (e) {
            throw new ImportLineError(i + 1, cardId, e);
          }
          updated++;
        }
        return { updated, errors };
      },
    );

    await logFoodAdmin(
      session.kameradName,
      "CSV-Import (Karten-IDs)",
      `Aktualisiert: ${updated}, Fehler: ${errors.length}`,
    );

    return NextResponse.json({ success: true, updated, errors });
  } catch (e) {
    const code = pgErrorCode(e instanceof ImportLineError ? e.cause : e);
    if (code === PG_UNIQUE_VIOLATION && e instanceof ImportLineError) {
      return NextResponse.json(
        {
          error: `Zeile ${e.line}: KartenID ${e.cardId} ist bereits einem anderen Kameraden zugeordnet. Import abgebrochen, nichts übernommen.`,
        },
        { status: 409 },
      );
    }
    if (code === PG_INSUFFICIENT_PRIVILEGE) {
      return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 });
    }
    console.error("Food user import error:", e);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
