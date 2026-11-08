import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { withGlobalAdminScope } from "@/lib/db/scoped";
import { kameraden } from "@/lib/db/schema";
import { PG_NO_DATA_FOUND, pgErrorCode } from "@/lib/db/pg-error";
import { requireGlobalAdmin } from "@/lib/benutzer-admin";
import { MODUL_ROLLEN, ROLLEN_SPALTEN, type RollenSpalte } from "@/lib/rollen";

// Spaltennamen in der Datenbank (Schlüssel des JSON für set_kamerad_rollen).
const SPALTE_ZU_DB: Record<RollenSpalte, string> = {
  psaRolle: "psa_rolle",
  foodRolle: "food_rolle",
  fkRolle: "fk_rolle",
  funkRolle: "funk_rolle",
};

// EINZIGE Route, die die Rollenspalten von core.kameraden schreibt
// (psa_rolle, food_rolle, fk_rolle, funk_rolle). Alle anderen Routen ignorieren
// sie. Nur globaler Admin. null/"" entfernt die Modulrolle.
// Danach token_version aller verknüpften Benutzer erhöhen: Die neuen Claims
// gelten erst nach erneutem Login, alte Tokens werden sofort ungültig.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ kameradId: string }> },
) {
  const guard = await requireGlobalAdmin();
  if (!guard.ok) return guard.response;

  const kameradId = Number((await params).kameradId);
  if (!Number.isInteger(kameradId) || kameradId <= 0) {
    return NextResponse.json({ error: "Ungültige kameradId" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger Body" }, { status: 400 });
  }

  const set: Partial<Record<RollenSpalte, string | null>> = {};
  for (const spalte of ROLLEN_SPALTEN) {
    if (!(spalte in body)) continue;
    const wert = body[spalte];
    if (wert === null || wert === "") {
      set[spalte] = null;
    } else if (typeof wert === "string" && MODUL_ROLLEN[spalte].includes(wert)) {
      set[spalte] = wert;
    } else {
      return NextResponse.json(
        {
          error: `${spalte} muss null oder eines von ${MODUL_ROLLEN[spalte].join(", ")} sein`,
        },
        { status: 400 },
      );
    }
  }
  if (Object.keys(set).length === 0) {
    return NextResponse.json(
      { error: `Keine Rollen übergeben (${ROLLEN_SPALTEN.join(", ")})` },
      { status: 400 },
    );
  }

  // Die Spalten schreibt ausschließlich core.set_kamerad_rollen (Spaltenrechte,
  // Migration 0013). Die Funktion verlangt app.app_rolle = 'Admin' und erhöht
  // token_version aller verknüpften Benutzer.
  const rollenJson: Record<string, string | null> = {};
  for (const spalte of ROLLEN_SPALTEN) {
    if (spalte in set) rollenJson[SPALTE_ZU_DB[spalte]] = set[spalte] ?? null;
  }

  try {
    const result = await withGlobalAdminScope(guard.user, async (tx) => {
      const [{ n }] = await tx.execute<{ n: number }>(
        sql`select core.set_kamerad_rollen(${kameradId}::integer, ${JSON.stringify(rollenJson)}::jsonb) as n`,
      );
      const [k] = await tx
        .select({
          id: kameraden.id,
          psaRolle: kameraden.psaRolle,
          foodRolle: kameraden.foodRolle,
          fkRolle: kameraden.fkRolle,
          funkRolle: kameraden.funkRolle,
        })
        .from(kameraden)
        .where(eq(kameraden.id, kameradId));
      return { kamerad: k, abgemeldeteBenutzer: n };
    });
    return NextResponse.json(result);
  } catch (e) {
    if (pgErrorCode(e) === PG_NO_DATA_FOUND) {
      return NextResponse.json({ error: "Kamerad nicht gefunden" }, { status: 404 });
    }
    throw e;
  }
}
