import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { kameraden, psaKameradDetails } from "@/lib/db/schema";
import { withScope } from "@/lib/db/scoped";
import { requirePsaSession } from "@/lib/psa-auth";

// Nur noch LESEN (z. B. für Auswahllisten). Anlegen, Ändern und Deaktivieren von
// Kameraden gibt es seit der zentralen Mitgliederverwaltung nur noch dort:
//   /api/mitglieder (Stammdaten, nur globale Admins)
//   /api/psa/groessen/[kameradId] (Größen, PSA Admin/Kleiderwart)
// Die früheren Schreibrouten (POST, PATCH, DELETE) sind entfernt; die Datenbank
// erlaubt PSA-Rollen das Schreiben auf core.kameraden seit Migration 0015 auch
// nicht mehr. Anfragen mit diesen Methoden beantwortet Next.js mit 405.

const kameradSelection = {
  id: kameraden.id,
  name: kameraden.name,
  vorname: kameraden.vorname,
  dienstgrad: kameraden.dienstgrad,
  email: kameraden.email,
  personalnummer: kameraden.personalnummer,
  kartenId: kameraden.kartenId,
  aktiv: kameraden.aktiv,
  psaRolle: kameraden.psaRolle,
  jackeGroesse: psaKameradDetails.jackeGroesse,
  hoseGroesse: psaKameradDetails.hoseGroesse,
  stiefelGroesse: psaKameradDetails.stiefelGroesse,
  handschuhGroesse: psaKameradDetails.handschuhGroesse,
  hemdGroesse: psaKameradDetails.hemdGroesse,
  poloshirtGroesse: psaKameradDetails.poloshirtGroesse,
  fleeceGroesse: psaKameradDetails.fleeceGroesse,
};

export async function GET(req: NextRequest) {
  const session = await requirePsaSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const nurAktiv = req.nextUrl.searchParams.get("nurAktiv") === "true";
  const scope = { kameradId: session.kameradId, psaRolle: session.psaRole };

  const kameradenList = await withScope(scope, async (tx) => {
    const conditions = [];
    // User sehen nur den eigenen Datensatz (zusätzlich zur RLS-Policy).
    if (session.isUser) conditions.push(eq(kameraden.id, session.kameradId));
    // ?nurAktiv=true blendet inaktive aus (z.B. für Zuteilungs-Dropdowns).
    if (nurAktiv) conditions.push(eq(kameraden.aktiv, true));

    return tx
      .select(kameradSelection)
      .from(kameraden)
      .leftJoin(psaKameradDetails, eq(psaKameradDetails.kameradId, kameraden.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(kameraden.name), asc(kameraden.vorname));
  });

  return NextResponse.json({ kameraden: kameradenList });
}
