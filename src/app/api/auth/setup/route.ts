import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { kameraden, benutzer } from "@/lib/db/schema";
import { signJwt, setAuthCookie } from "@/lib/auth";

// Erst-Einrichtung: nur möglich, solange noch kein Benutzer existiert.
// Henne-Ei-Problem: benutzer.kamerad_id ist NOT NULL, beim allerersten Account
// gibt es aber noch keinen Kameraden. Lösung: In DERSELBEN Transaktion zuerst
// den Kameraden-Datensatz anlegen, dann den damit verknüpften Admin-Account.
export async function POST(req: NextRequest) {
  try {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(benutzer);
    if (count > 0) {
      return NextResponse.json(
        { error: "System ist bereits initialisiert" },
        { status: 400 },
      );
    }

    const body = await req.json();
    const username: string = body.benutzername || body.username;
    const password: string = body.pin || body.password;
    const vorname: string = body.vorname;
    const name: string = body.name;

    if (!username || !password || !vorname || !name) {
      return NextResponse.json(
        { error: "Benutzername, PIN, Vorname und Name erforderlich" },
        { status: 400 },
      );
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: "PIN muss mindestens 6 Zeichen lang sein" },
        { status: 400 },
      );
    }

    const pinHash = await hash(password, 12);

    const created = await db.transaction(async (tx) => {
      const [kamerad] = await tx
        .insert(kameraden)
        .values({
          vorname,
          name,
          psaRolle: "Admin",
          foodRolle: "Admin",
          fkRolle: "Admin",
          funkRolle: "Admin",
        })
        .returning();

      const [user] = await tx
        .insert(benutzer)
        .values({
          benutzername: username,
          pin: pinHash,
          rolle: "Admin",
          kameradId: kamerad.id,
          aktiv: true,
        })
        .returning();

      return { kamerad, user };
    });

    const token = await signJwt({
      sub: created.user.benutzername,
      app_role: "Admin",
      kamerad_id: created.kamerad.id,
      kamerad_name: `${created.kamerad.vorname} ${created.kamerad.name}`,
      email: created.kamerad.email ?? undefined,
      psa_rolle: "Admin",
      food_rolle: "Admin",
      fk_rolle: "Admin",
      funk_rolle: "Admin",
    });

    const isHttps = req.headers.get("x-forwarded-proto") === "https";
    await setAuthCookie(token, isHttps);

    return NextResponse.json({
      user: {
        id: created.user.id,
        benutzername: created.user.benutzername,
        rolle: created.user.rolle,
        kamerad_id: created.kamerad.id,
        kamerad_name: `${created.kamerad.vorname} ${created.kamerad.name}`,
        psa_rolle: "Admin",
        food_rolle: "Admin",
        fk_rolle: "Admin",
        funk_rolle: "Admin",
      },
    });
  } catch (e) {
    console.error("Setup error:", e);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
