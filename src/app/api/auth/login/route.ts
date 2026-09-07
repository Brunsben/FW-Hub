import { NextRequest, NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { benutzer, kameraden } from "@/lib/db/schema";
import { signJwt, setAuthCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const username: string = body.benutzername || body.username;
    const password: string = body.pin || body.password;

    if (!username || !password) {
      return NextResponse.json(
        { error: "Benutzername und PIN erforderlich" },
        { status: 400 },
      );
    }

    const [user] = await db
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

    if (!user || !valid) {
      return NextResponse.json(
        { error: "Benutzername oder PIN falsch" },
        { status: 401 },
      );
    }

    // kamerad_id ist NOT NULL — der verknüpfte Kamerad existiert garantiert.
    const [kamerad] = await db
      .select()
      .from(kameraden)
      .where(eq(kameraden.id, user.kameradId))
      .limit(1);

    const token = await signJwt({
      sub: user.benutzername,
      app_role: user.rolle,
      kamerad_id: user.kameradId,
      kamerad_name: `${kamerad.vorname} ${kamerad.name}`,
      email: kamerad.email ?? undefined,
      psa_rolle: kamerad.psaRolle,
      food_rolle: kamerad.foodRolle,
      fk_rolle: kamerad.fkRolle,
      funk_rolle: kamerad.funkRolle,
    });

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
