import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { withScope } from "@/lib/db/scoped";
import { expectRows } from "@/lib/db/rows";
import { benutzer } from "@/lib/db/schema";
import { clearAuthCookie, getAuthUser } from "@/lib/auth";

// "Überall abmelden": erhöht die token_version des eigenen Benutzers. Damit
// sind alle ausgestellten Tokens (auch kopierte) beim nächsten Request
// ungültig. Das Cookie dieser Sitzung wird zusätzlich gelöscht. Nur POST.
export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  // Eigene Zeile: benutzer_scope erlaubt kamerad_id = app.kamerad_id.
  await withScope({ kameradId: user.kamerad_id, psaRolle: "" }, async (tx) =>
    expectRows(
      await tx
        .update(benutzer)
        .set({
          tokenVersion: sql`${benutzer.tokenVersion} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(benutzer.id, user.benutzer_id))
        .returning({ id: benutzer.id }),
      "Überall abmelden",
    ),
  );

  const isHttps = req.headers.get("x-forwarded-proto") === "https";
  await clearAuthCookie(isHttps);
  return NextResponse.json({ ok: true });
}
