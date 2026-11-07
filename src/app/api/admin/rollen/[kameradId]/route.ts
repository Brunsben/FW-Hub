import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { withGlobalAdminScope } from "@/lib/db/scoped";
import { benutzer, kameraden } from "@/lib/db/schema";
import { requireGlobalAdmin } from "@/lib/benutzer-admin";
import { MODUL_ROLLEN, ROLLEN_SPALTEN, type RollenSpalte } from "@/lib/rollen";

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

  const result = await withGlobalAdminScope(guard.user, async (tx) => {
    const [k] = await tx
      .update(kameraden)
      .set({ ...set, updatedAt: new Date() })
      .where(eq(kameraden.id, kameradId))
      .returning({
        id: kameraden.id,
        psaRolle: kameraden.psaRolle,
        foodRolle: kameraden.foodRolle,
        fkRolle: kameraden.fkRolle,
        funkRolle: kameraden.funkRolle,
      });
    if (!k) return null;

    const betroffen = await tx
      .update(benutzer)
      .set({
        tokenVersion: sql`${benutzer.tokenVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(benutzer.kameradId, kameradId))
      .returning({ id: benutzer.id });
    return { kamerad: k, abgemeldeteBenutzer: betroffen.length };
  });

  if (!result) {
    return NextResponse.json({ error: "Kamerad nicht gefunden" }, { status: 404 });
  }
  return NextResponse.json(result);
}
