import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { withDienstplanScope } from "@/lib/db/scoped";
import { dpKategorien } from "@/lib/db/schema-dienstplan";
import { requireDienstplanSession } from "@/lib/dienstplan/auth";

// Kategorien der eigenen Organisation (D, Z, G, …). Lesen darf jede angemeldete
// Person (Rolle Mitglied genügt); welche Zeilen sichtbar sind, entscheidet RLS
// (kategorien_lesen). Ändern kommt mit der Verwaltung (nur Dienstplan-Admin).
export async function GET() {
  const s = await requireDienstplanSession();
  if (!s) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const kategorien = await withDienstplanScope(
    { kameradId: s.kameradId, dienstRolle: s.rolle, organisationId: s.organisationId },
    (tx) =>
      tx
        .select({
          id: dpKategorien.id,
          kuerzel: dpKategorien.kuerzel,
          name: dpKategorien.name,
          farbe: dpKategorien.farbe,
          standardUhrzeit: dpKategorien.standardUhrzeit,
          standardDauerMinuten: dpKategorien.standardDauerMinuten,
          sortierung: dpKategorien.sortierung,
          aktiv: dpKategorien.aktiv,
        })
        .from(dpKategorien)
        .orderBy(asc(dpKategorien.sortierung), asc(dpKategorien.kuerzel)),
  );
  return NextResponse.json({ kategorien });
}
