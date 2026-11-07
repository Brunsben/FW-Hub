import { NextRequest, NextResponse } from "next/server";
import { compare, hash } from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { authDb } from "@/lib/db/auth-client";
import { withScope } from "@/lib/db/scoped";
import { expectRows } from "@/lib/db/rows";
import { benutzer, kameraden } from "@/lib/db/schema";
import { getAuthUser, setAuthCookie, signJwt } from "@/lib/auth";
import { checkLock, getClientIp, recordAttempt } from "@/lib/login-throttle";
import { buildJwtPayload } from "@/lib/session-token";
import { MIN_PIN_LAENGE } from "@/lib/benutzer-admin";

// Eigene PIN ändern (jeder eingeloggte Benutzer). Falsche alte PIN zählt als
// Fehlversuch der Login-Sperre; bei Sperre 429 ohne PIN-Prüfung.
// Danach token_version + 1 (alle anderen Sessions ungültig) und für diese
// Sitzung ein neues Cookie mit dem neuen Stand.
export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger Body" }, { status: 400 });
  }
  const altePin = body.altePin ?? body.alte_pin;
  const neuePin = body.neuePin ?? body.neue_pin;
  if (typeof altePin !== "string" || typeof neuePin !== "string" || !altePin) {
    return NextResponse.json(
      { error: "alte und neue PIN erforderlich" },
      { status: 400 },
    );
  }
  if (neuePin.length < MIN_PIN_LAENGE) {
    return NextResponse.json(
      { error: `Neue PIN muss mindestens ${MIN_PIN_LAENGE} Zeichen lang sein` },
      { status: 400 },
    );
  }
  if (neuePin === altePin) {
    return NextResponse.json(
      { error: "Neue PIN muss sich von der alten unterscheiden" },
      { status: 400 },
    );
  }

  const [row] = await authDb
    .select({ benutzername: benutzer.benutzername, pin: benutzer.pin })
    .from(benutzer)
    .where(eq(benutzer.id, user.benutzer_id))
    .limit(1);
  if (!row) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const nameKey = row.benutzername.toLowerCase();
  const ip = getClientIp(req);
  const lock = await checkLock(nameKey, ip);
  if (lock.locked) {
    return NextResponse.json(
      {
        error: "Zu viele Fehlversuche. Bitte später erneut versuchen.",
        retryAfterSec: lock.retryAfterSec,
      },
      { status: 429, headers: { "Retry-After": String(lock.retryAfterSec) } },
    );
  }

  const ok = await compare(altePin, row.pin);
  await recordAttempt(nameKey, ip, ok);
  if (!ok) {
    return NextResponse.json({ error: "Alte PIN ist falsch" }, { status: 403 });
  }

  const pinHash = await hash(neuePin, 12);
  // Eigene Zeile: benutzer_scope erlaubt kamerad_id = app.kamerad_id.
  const { updated, kamerad } = await withScope(
    { kameradId: user.kamerad_id, psaRolle: "" },
    async (tx) => {
      const [updated] = expectRows(
        await tx
          .update(benutzer)
          .set({
            pin: pinHash,
            tokenVersion: sql`${benutzer.tokenVersion} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(benutzer.id, user.benutzer_id))
          .returning({
            id: benutzer.id,
            benutzername: benutzer.benutzername,
            rolle: benutzer.rolle,
            kameradId: benutzer.kameradId,
            tokenVersion: benutzer.tokenVersion,
          }),
        "PIN-Änderung",
      );
      const [kamerad] = await tx
        .select()
        .from(kameraden)
        .where(eq(kameraden.id, user.kamerad_id))
        .limit(1);
      return { updated, kamerad };
    },
  );

  const token = await signJwt(buildJwtPayload(updated, kamerad));
  const isHttps = req.headers.get("x-forwarded-proto") === "https";
  await setAuthCookie(token, isHttps);

  return NextResponse.json({ ok: true });
}
