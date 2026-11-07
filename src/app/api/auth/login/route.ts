import { NextRequest, NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { and, eq, sql } from "drizzle-orm";
import { authDb } from "@/lib/db/auth-client";
import { withScope } from "@/lib/db/scoped";
import { benutzer, kameraden } from "@/lib/db/schema";
import { signJwt, setAuthCookie } from "@/lib/auth";
import { checkLock, getClientIp, recordAttempt } from "@/lib/login-throttle";
import { buildJwtPayload } from "@/lib/session-token";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const username: unknown = body.benutzername || body.username;
    const password: unknown = body.pin || body.password;

    if (
      typeof username !== "string" ||
      typeof password !== "string" ||
      !username ||
      !password
    ) {
      return NextResponse.json(
        { error: "Benutzername und PIN erforderlich" },
        { status: 400 },
      );
    }

    // Login-Sperre VOR dem Benutzer-Lookup und ohne bcrypt. Gesperrte
    // Anfragen werden nicht als Fehlversuch gezählt.
    const nameKey = username.toLowerCase();
    const ip = getClientIp(req);
    const lock = await checkLock(nameKey, ip);
    if (lock.locked) {
      return NextResponse.json(
        {
          error: "Zu viele Fehlversuche. Bitte später erneut versuchen.",
          retryAfterSec: lock.retryAfterSec,
        },
        {
          status: 429,
          headers: { "Retry-After": String(lock.retryAfterSec) },
        },
      );
    }

    const [user] = await authDb
      .select()
      .from(benutzer)
      .where(
        and(
          eq(sql`lower(${benutzer.benutzername})`, username.toLowerCase()),
          eq(benutzer.aktiv, true),
        ),
      )
      .limit(1);

    // bcrypt auch bei fehlendem User rechnen, um Timing-Leaks zu vermeiden
    const valid = user
      ? await compare(password, user.pin)
      : await compare(password, "$2a$12$invalidinvalidinvalidinvalidinvalidino");

    // Auch unbekannte/inaktive Namen zählen (keine Enumeration über die Sperre).
    await recordAttempt(nameKey, ip, Boolean(user && valid));

    if (!user || !valid) {
      return NextResponse.json(
        { error: "Benutzername oder PIN falsch" },
        { status: 401 },
      );
    }

    // core.kameraden liegt hinter RLS. fw_auth darf es NICHT lesen; daher mit
    // dem jetzt bekannten Scope des Benutzers über den regulären Client lesen.
    // Die eigene Zeile ist über kameraden_scope (id = app.kamerad_id) sichtbar;
    // die App-Rolle wird bewusst NICHT als psa_rolle in den Scope gesetzt.
    const [kamerad] = await withScope(
      { kameradId: user.kameradId, psaRolle: "" },
      (tx) =>
        tx
          .select()
          .from(kameraden)
          .where(eq(kameraden.id, user.kameradId))
          .limit(1),
    );

    // Claims inkl. benutzer_id und tv (token_version).
    const token = await signJwt(buildJwtPayload(user, kamerad));

    const isHttps = req.headers.get("x-forwarded-proto") === "https";
    await setAuthCookie(token, isHttps);

    return NextResponse.json({
      user: {
        id: user.id,
        benutzername: user.benutzername,
        rolle: user.rolle,
        kamerad_id: user.kameradId,
        kamerad_name: `${kamerad.vorname} ${kamerad.name}`,
        psa_rolle: kamerad.psaRolle,
        food_rolle: kamerad.foodRolle,
        fk_rolle: kamerad.fkRolle,
        funk_rolle: kamerad.funkRolle,
      },
    });
  } catch (e) {
    console.error("Login error:", e);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
