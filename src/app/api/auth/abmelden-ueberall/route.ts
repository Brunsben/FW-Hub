import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { withScope } from "@/lib/db/scoped";
import { expectRows } from "@/lib/db/rows";
import { clearAuthCookie, getAuthUser } from "@/lib/auth";

// "Überall abmelden": erhöht die token_version des eigenen Benutzers. Damit
// sind alle ausgestellten Tokens (auch kopierte) beim nächsten Request
// ungültig. Das Cookie dieser Sitzung wird zusätzlich gelöscht. Nur POST.
export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  // Nur der globale Admin darf core.benutzer direkt schreiben. Die eigene
  // token_version erhöht core.eigene_sitzungen_beenden (nur die Zeile mit
  // kamerad_id = app.kamerad_id).
  await withScope({ kameradId: user.kamerad_id, psaRolle: "" }, async (tx) =>
    expectRows(
      (
        await tx.execute<{ n: number }>(
          sql`select core.eigene_sitzungen_beenden(${user.benutzer_id}::integer) as n`,
        )
      ).filter((r) => r.n === 1),
      "Überall abmelden",
    ),
  );

  const isHttps = req.headers.get("x-forwarded-proto") === "https";
  await clearAuthCookie(isHttps);
  return NextResponse.json({ ok: true });
}
