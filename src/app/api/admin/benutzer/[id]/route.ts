import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { withGlobalAdminScope } from "@/lib/db/scoped";
import { benutzer, kameraden } from "@/lib/db/schema";
import {
  assertAdminsRemain,
  BenutzerKonflikt,
  benutzerOhnePin,
  konfliktResponse,
  MIN_PIN_LAENGE,
  requireGlobalAdmin,
} from "@/lib/benutzer-admin";
import { APP_ROLES, type AppRole } from "@/lib/rollen";

// PATCH: aktiv, rolle, PIN-Reset. Kein DELETE (Benutzer werden nur deaktiviert).
// token_version wird erhöht bei Deaktivierung, Rollenänderung und PIN-Reset →
// bestehende Tokens des Benutzers werden beim nächsten Request ungültig.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireGlobalAdmin();
  if (!guard.ok) return guard.response;
  const admin = guard.user;

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Ungültige id" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger Body" }, { status: 400 });
  }

  const hatAktiv = "aktiv" in body;
  const hatRolle = "rolle" in body;
  const hatPin = "pin" in body;
  if (!hatAktiv && !hatRolle && !hatPin) {
    return NextResponse.json(
      { error: "Keine Felder (aktiv, rolle, pin) übergeben" },
      { status: 400 },
    );
  }
  if (hatAktiv && typeof body.aktiv !== "boolean") {
    return NextResponse.json({ error: "aktiv muss boolean sein" }, { status: 400 });
  }
  if (hatRolle && !APP_ROLES.includes(body.rolle as AppRole)) {
    return NextResponse.json(
      { error: `rolle muss eines von ${APP_ROLES.join(", ")} sein` },
      { status: 400 },
    );
  }
  if (hatPin && (typeof body.pin !== "string" || body.pin.length < MIN_PIN_LAENGE)) {
    return NextResponse.json(
      { error: `PIN muss mindestens ${MIN_PIN_LAENGE} Zeichen lang sein` },
      { status: 400 },
    );
  }
  const pinHash = hatPin ? await hash(body.pin as string, 12) : null;

  try {
    const updated = await withGlobalAdminScope(admin, async (tx) => {
      const [ziel] = await tx
        .select({
          id: benutzer.id,
          rolle: benutzer.rolle,
          aktiv: benutzer.aktiv,
          kameradId: benutzer.kameradId,
        })
        .from(benutzer)
        .where(eq(benutzer.id, id))
        .for("update");
      if (!ziel) return null;

      const selbst = ziel.id === admin.benutzer_id;
      const deaktivieren = hatAktiv && body.aktiv === false && ziel.aktiv;
      const reaktivieren = hatAktiv && body.aktiv === true && !ziel.aktiv;
      const neueRolle = hatRolle ? (body.rolle as AppRole) : ziel.rolle;
      const rolleGeaendert = neueRolle !== ziel.rolle;
      const herabstufen = ziel.rolle === "Admin" && neueRolle !== "Admin";

      if (selbst && hatAktiv && body.aktiv === false) {
        throw new BenutzerKonflikt("Du kannst dich nicht selbst deaktivieren.");
      }
      if (selbst && herabstufen) {
        throw new BenutzerKonflikt("Du kannst deine eigene Rolle nicht absenken.");
      }
      if (ziel.rolle === "Admin" && ziel.aktiv && (deaktivieren || herabstufen)) {
        await assertAdminsRemain(tx, [ziel.id]);
      }
      if (reaktivieren) {
        const [k] = await tx
          .select({ aktiv: kameraden.aktiv })
          .from(kameraden)
          .where(eq(kameraden.id, ziel.kameradId));
        if (!k?.aktiv) {
          throw new BenutzerKonflikt(
            "Der verknüpfte Kamerad ist deaktiviert. Erst den Kameraden reaktivieren.",
          );
        }
      }

      const set: Record<string, unknown> = { updatedAt: new Date() };
      if (hatAktiv) set.aktiv = body.aktiv;
      if (hatRolle) set.rolle = neueRolle;
      if (pinHash) set.pin = pinHash;
      if (deaktivieren || rolleGeaendert || pinHash) {
        set.tokenVersion = sql`${benutzer.tokenVersion} + 1`;
      }

      const [row] = await tx
        .update(benutzer)
        .set(set)
        .where(eq(benutzer.id, id))
        .returning(benutzerOhnePin);
      if (!row) throw new Error("Benutzer-Update ohne Zeile (RLS)");
      return row;
    });

    if (!updated) {
      return NextResponse.json({ error: "Benutzer nicht gefunden" }, { status: 404 });
    }
    return NextResponse.json({ benutzer: updated });
  } catch (e) {
    const konflikt = konfliktResponse(e);
    if (konflikt) return konflikt;
    throw e;
  }
}
