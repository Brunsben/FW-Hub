import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { authDb } from "@/lib/db/auth-client";
import { withGlobalAdminScope } from "@/lib/db/scoped";
import { kameraden, benutzer } from "@/lib/db/schema";
import { kameradenStammdaten } from "@/lib/db/kameraden-stamm";
import { signJwt, setAuthCookie } from "@/lib/auth";
import { buildJwtPayload } from "@/lib/session-token";

// Erst-Einrichtung: nur möglich, solange noch kein Benutzer existiert.
// Henne-Ei-Problem: benutzer.kamerad_id ist NOT NULL, beim allerersten Account
// gibt es aber noch keinen Kameraden. Lösung: In DERSELBEN Transaktion zuerst
// den Kameraden-Datensatz anlegen, dann den damit verknüpften Admin-Account.
export async function POST(req: NextRequest) {
  try {
    // Guard über fw_auth (BYPASSRLS): unter RLS würde fw_app ohne Scope 0
    // Zeilen sehen und die Initialisierung fälschlich erneut erlauben.
    const [{ count }] = await authDb
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

    // Erst-Setup-Scope: withGlobalAdminScope (app.app_rolle='Admin') erlaubt
    // beide INSERTs, obwohl die kamerad_id noch nicht bekannt ist. Sicher, weil
    // dieser Pfad durch count===0 geschützt ist. Die Rollen schreibt wie überall
    // core.set_kamerad_rollen (keine Spaltenrechte auf den Rollenspalten).
    const created = await withGlobalAdminScope(
      { kamerad_id: 0, app_role: "Admin" },
      async (tx) => {
        const [angelegt] = await tx
          .insert(kameradenStammdaten)
          .values({ vorname, name })
          .returning({ id: kameraden.id });

        await tx.execute(
          sql`select core.set_kamerad_rollen(${angelegt.id}::integer, ${JSON.stringify(
            {
              psa_rolle: "Admin",
              food_rolle: "Admin",
              fk_rolle: "Admin",
              funk_rolle: "Admin",
              dienst_rolle: "Admin",
            },
          )}::jsonb)`,
        );

        const [kamerad] = await tx
          .select()
          .from(kameraden)
          .where(eq(kameraden.id, angelegt.id));

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
      },
    );

    // Claims inkl. benutzer_id und tv (token_version) aus den angelegten Zeilen.
    const token = await signJwt(buildJwtPayload(created.user, created.kamerad));

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
        dienst_rolle: "Admin",
      },
    });
  } catch (e) {
    console.error("Setup error:", e);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
