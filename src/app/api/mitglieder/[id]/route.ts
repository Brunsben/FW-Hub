import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAuthUser } from "@/lib/auth";
import { withGlobalAdminScope } from "@/lib/db/scoped";
import { kameraden } from "@/lib/db/schema";
import { constraintName, PG_UNIQUE_VIOLATION, pgErrorCode } from "@/lib/db/pg-error";
import { konfliktResponse, requireGlobalAdmin } from "@/lib/benutzer-admin";
import { ladeMitglied } from "@/lib/mitglieder/lesen";
import { kannMitgliedSehen } from "@/lib/mitglieder/rechte";
import { pruefeStammdaten } from "@/lib/mitglieder/validierung";

async function leseId(params: Promise<{ id: string }>): Promise<number | null> {
  const id = Number((await params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Ein Mitglied. Sehen darf es jede Verwaltungsrolle und jede Person für sich
// selbst. Die Felder richten sich nach der Rolle (siehe lib/mitglieder/lesen.ts).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const id = await leseId(params);
  if (id === null) return NextResponse.json({ error: "Ungültige id" }, { status: 400 });
  if (!kannMitgliedSehen(user, id)) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 });
  }
  const mitglied = await ladeMitglied(user, id);
  if (!mitglied) return NextResponse.json({ error: "Mitglied nicht gefunden" }, { status: 404 });
  return NextResponse.json({ mitglied });
}

// Stammdaten ändern, Kamerad deaktivieren und reaktivieren (nur globaler Admin).
//   Body: beliebige von { vorname, name, dienstgrad, email, personalnummer,
//         spitzname, spitznameAnzeigen, aktiv }
// Rollen, Karten-ID und Zugang gehören nicht hierher (set_kamerad_rollen,
// set_karten_id, /api/admin/benutzer). Rollen und Karten-ID im Body lehnt die
// Prüfung mit 400 und dem Hinweis auf den richtigen Ort ab.
// Die Deaktivierung eines Kameraden sperrt dessen Login über den Trigger
// core.kamerad_deaktiviert; Reaktivieren öffnet den Login NICHT wieder.
// Schutzregeln (eigener Kamerad, letzter Admin) kommen als 409 aus dem Trigger.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireGlobalAdmin();
  if (!guard.ok) return guard.response;
  const id = await leseId(params);
  if (id === null) return NextResponse.json({ error: "Ungültige id" }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger Body" }, { status: 400 });
  }
  const stamm = pruefeStammdaten(body, "aendern");
  if (!stamm.ok) return NextResponse.json({ error: stamm.fehler }, { status: 400 });

  try {
    const geaendert = await withGlobalAdminScope(guard.user, (tx) =>
      tx
        .update(kameraden)
        .set({ ...stamm.daten, updatedAt: new Date() })
        .where(eq(kameraden.id, id))
        .returning({ id: kameraden.id }),
    );
    if (geaendert.length === 0) {
      return NextResponse.json({ error: "Mitglied nicht gefunden" }, { status: 404 });
    }
  } catch (e) {
    const konflikt = konfliktResponse(e);
    if (konflikt) return konflikt;
    if (pgErrorCode(e) === PG_UNIQUE_VIOLATION) {
      const text = (constraintName(e) ?? "").includes("personalnummer")
        ? "Personalnummer ist bereits vergeben."
        : "Eintrag existiert bereits.";
      return NextResponse.json({ error: text }, { status: 409 });
    }
    throw e;
  }
  const mitglied = await ladeMitglied(guard.user, id);
  return NextResponse.json({ mitglied });
}
