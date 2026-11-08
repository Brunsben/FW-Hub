import { NextRequest, NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { authDb } from "@/lib/db/auth-client";
import { withScope } from "@/lib/db/scoped";
import { benutzer, kameraden } from "@/lib/db/schema";
import { signJwt, setAuthCookie } from "@/lib/auth";
import { checkLock, getClientIp, recordAttempt } from "@/lib/login-throttle";
import { buildJwtPayload } from "@/lib/session-token";

const DUMMY_HASH =
  "$2b$12$H1wUMPfWha5eLlR7EFHndONkWd/pXsoVzrvaa.h30PfNeWrf.0GZm";

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

    // Benutzer unabhängig von "aktiv" suchen: Die Meldung für deaktivierte
    // Konten gibt es erst NACH der PIN-Prüfung (siehe unten).
    const [user] = await authDb
      .select()
      .from(benutzer)
      .where(eq(sql`lower(${benutzer.benutzername})`, username.toLowerCase()))
      .limit(1);

    // bcrypt auch bei fehlendem User rechnen, um Timing-Leaks zu vermeiden.
    // Der Platzhalter muss ein GÜLTIGER bcrypt-Hash mit demselben Kostenfaktor
    // (12) sein, sonst bricht compare() sofort ab und der Aufruf ist ~10x
    // schneller als bei einem echten Benutzer. Zufälliges Passwort, verworfen.
    const valid = user
      ? await compare(password, user.pin)
      : await compare(password, DUMMY_HASH);
    const pinOk = Boolean(user && valid);

    // core.kameraden liegt hinter RLS. fw_auth darf es NICHT lesen; daher mit
    // dem Scope des Benutzers über den regulären Client lesen. Die eigene Zeile
    // ist über kameraden_lesen (id = app.kamerad_id) sichtbar; die App-Rolle
    // wird bewusst NICHT als psa_rolle in den Scope gesetzt.
    // Die Abfrage läuft auf JEDEM Pfad (auch bei falscher PIN und bei
    // unbekanntem Namen, dann mit id 0), damit alle Antworten ähnlich lange
    // dauern und die Laufzeit nichts über Name, PIN oder Kontostatus verrät.
    const kameradId = user?.kameradId ?? 0;
    const [kamerad] = await withScope({ kameradId, psaRolle: "" }, (tx) =>
      tx.select().from(kameraden).where(eq(kameraden.id, kameradId)).limit(1),
    );

    // Konto nutzbar = Benutzer UND Kamerad aktiv. Bei falscher PIN ist das
    // egal, die Antwort bleibt die allgemeine Meldung.
    const kontoAktiv = Boolean(user?.aktiv && kamerad?.aktiv);

    // Zählt als Erfolg nur, wenn PIN stimmt UND das Konto aktiv ist. Ein
    // deaktiviertes Konto mit richtiger PIN zählt wie ein Fehlversuch (gleiche
    // Sperrlogik, kein Zurücksetzen des Zählers). Auch unbekannte Namen zählen
    // (keine Enumeration über die Sperre).
    await recordAttempt(nameKey, ip, pinOk && kontoAktiv);

    if (!pinOk) {
      return NextResponse.json(
        { error: "Benutzername oder PIN falsch" },
        { status: 401 },
      );
    }
    if (!kontoAktiv) {
      // Nur mit richtiger PIN erreichbar: Wer das Konto kennt, darf wissen,
      // warum die Anmeldung scheitert.
      return NextResponse.json(
        {
          error:
            "Dein Konto ist deaktiviert. Bitte wende dich an die Wehrführung.",
        },
        { status: 403 },
      );
    }

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
