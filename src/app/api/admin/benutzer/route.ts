import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { asc, eq, sql } from "drizzle-orm";
import { withGlobalAdminScope } from "@/lib/db/scoped";
import { benutzer, kameraden } from "@/lib/db/schema";
import { PG_UNIQUE_VIOLATION, pgErrorCode } from "@/lib/db/pg-error";
import {
  BenutzerKonflikt,
  benutzerOhnePin,
  konfliktResponse,
  MIN_PIN_LAENGE,
  requireGlobalAdmin,
} from "@/lib/benutzer-admin";
import { APP_ROLES, type AppRole } from "@/lib/rollen";

// Liste aller Benutzer mit Kamerad-Name, App-Rolle, aktiv und den vier
// Modulrollen. Der PIN-Hash wird nie selektiert.
export async function GET() {
  const guard = await requireGlobalAdmin();
  if (!guard.ok) return guard.response;

  const rows = await withGlobalAdminScope(guard.user, (tx) =>
    tx
      .select({
        ...benutzerOhnePin,
        vorname: kameraden.vorname,
        name: kameraden.name,
        kameradAktiv: kameraden.aktiv,
        psaRolle: kameraden.psaRolle,
        foodRolle: kameraden.foodRolle,
        fkRolle: kameraden.fkRolle,
        funkRolle: kameraden.funkRolle,
      })
      .from(benutzer)
      .innerJoin(kameraden, eq(kameraden.id, benutzer.kameradId))
      .orderBy(asc(kameraden.name), asc(kameraden.vorname)),
  );

  return NextResponse.json({ benutzer: rows });
}

// Neuer Account für einen bestehenden, aktiven Kameraden ohne Account.
export async function POST(req: NextRequest) {
  const guard = await requireGlobalAdmin();
  if (!guard.ok) return guard.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger Body" }, { status: 400 });
  }

  const kameradId = Number(body.kameradId ?? body.kamerad_id);
  const benutzername =
    typeof body.benutzername === "string" ? body.benutzername.trim() : "";
  const pin = typeof body.pin === "string" ? body.pin : "";
  const rolle = (body.rolle ?? "User") as AppRole;

  if (!Number.isInteger(kameradId) || kameradId <= 0) {
    return NextResponse.json({ error: "kamerad_id erforderlich" }, { status: 400 });
  }
  if (!benutzername || benutzername.length > 64 || /\s/.test(benutzername)) {
    return NextResponse.json(
      { error: "Benutzername erforderlich (ohne Leerzeichen, max. 64 Zeichen)" },
      { status: 400 },
    );
  }
  if (pin.length < MIN_PIN_LAENGE) {
    return NextResponse.json(
      { error: `PIN muss mindestens ${MIN_PIN_LAENGE} Zeichen lang sein` },
      { status: 400 },
    );
  }
  if (!APP_ROLES.includes(rolle)) {
    return NextResponse.json(
      { error: `rolle muss eines von ${APP_ROLES.join(", ")} sein` },
      { status: 400 },
    );
  }

  const pinHash = await hash(pin, 12);

  try {
    const created = await withGlobalAdminScope(guard.user, async (tx) => {
      // Kamerad sperren: serialisiert parallele Anlagen für denselben Kameraden.
      const [kamerad] = await tx
        .select({ id: kameraden.id, aktiv: kameraden.aktiv })
        .from(kameraden)
        .where(eq(kameraden.id, kameradId))
        .for("update");
      if (!kamerad) return null;
      if (!kamerad.aktiv) {
        throw new BenutzerKonflikt("Kamerad ist deaktiviert.");
      }

      const [vorhanden] = await tx
        .select({ id: benutzer.id })
        .from(benutzer)
        .where(eq(benutzer.kameradId, kameradId))
        .limit(1);
      if (vorhanden) {
        throw new BenutzerKonflikt("Kamerad hat bereits einen Account.");
      }

      const [nameBelegt] = await tx
        .select({ id: benutzer.id })
        .from(benutzer)
        .where(sql`lower(${benutzer.benutzername}) = lower(${benutzername})`)
        .limit(1);
      if (nameBelegt) {
        throw new BenutzerKonflikt("Benutzername ist bereits vergeben.");
      }

      const [row] = await tx
        .insert(benutzer)
        .values({ benutzername, pin: pinHash, rolle, kameradId, aktiv: true })
        .returning(benutzerOhnePin);
      return row;
    });

    if (!created) {
      return NextResponse.json({ error: "Kamerad nicht gefunden" }, { status: 404 });
    }
    return NextResponse.json({ benutzer: created }, { status: 201 });
  } catch (e) {
    const konflikt = konfliktResponse(e);
    if (konflikt) return konflikt;
    if (pgErrorCode(e) === PG_UNIQUE_VIOLATION) {
      // idx_benutzer_benutzername_lower bzw. unique(benutzername) bei Wettlauf
      return NextResponse.json(
        { error: "Benutzername ist bereits vergeben." },
        { status: 409 },
      );
    }
    throw e;
  }
}
