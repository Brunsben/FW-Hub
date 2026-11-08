import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { kameraden, psaKameradDetails } from "@/lib/db/schema";
import { withScope } from "@/lib/db/scoped";
import { requirePsaSession } from "@/lib/psa-auth";
import { logChange } from "@/lib/psa-changelog";
import { pruefeGroessen } from "@/lib/psa-groessen";

// Größen eines Kameraden speichern (psa.kamerad_details). Erlaubt für PSA-Admin
// und Kleiderwart. Die Größen gehören zum PSA-Modul, die Stammdaten der Person
// nicht: Dafür gibt es /api/mitglieder (nur globale Admins). Durchgesetzt wird
// das Schreibrecht in der Datenbank (kamerad_details_priv, FOR ALL für
// psa_rolle Admin/Kleiderwart), diese Route prüft es vorab.
//   Body: beliebige von { jackeGroesse, hoseGroesse, stiefelGroesse,
//         handschuhGroesse, hemdGroesse, poloshirtGroesse, fleeceGroesse }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ kameradId: string }> },
) {
  const session = await requirePsaSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }
  if (!session.canEdit) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 });
  }

  const kameradId = Number((await params).kameradId);
  if (!Number.isInteger(kameradId) || kameradId <= 0) {
    return NextResponse.json({ error: "Ungültige id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger Body" }, { status: 400 });
  }
  const pruefung = pruefeGroessen(body);
  if (!pruefung.ok) {
    return NextResponse.json({ error: pruefung.fehler }, { status: 400 });
  }

  const scope = { kameradId: session.kameradId, psaRolle: session.psaRole };
  const ergebnis = await withScope(scope, async (tx) => {
    const [k] = await tx
      .select({ vorname: kameraden.vorname, name: kameraden.name })
      .from(kameraden)
      .where(eq(kameraden.id, kameradId))
      .limit(1);
    if (!k) return null;
    const [zeile] = await tx
      .insert(psaKameradDetails)
      .values({ kameradId, ...pruefung.daten })
      .onConflictDoUpdate({
        target: psaKameradDetails.kameradId,
        set: { ...pruefung.daten, updatedAt: new Date() },
      })
      .returning();
    return { kamerad: k, groessen: zeile };
  });

  if (!ergebnis) {
    return NextResponse.json({ error: "Mitglied nicht gefunden" }, { status: 404 });
  }
  await logChange(
    session,
    "Kameraden",
    "Größen bearbeitet",
    `${ergebnis.kamerad.vorname} ${ergebnis.kamerad.name}`,
  );
  return NextResponse.json({ groessen: ergebnis.groessen });
}
