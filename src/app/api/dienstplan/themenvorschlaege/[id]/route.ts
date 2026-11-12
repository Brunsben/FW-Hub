import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { expectRows } from "@/lib/db/rows";
import { pruefeVorschlagStatus } from "@/lib/dienstplan/eingabe";
import { dienstplanRoute, DpFehler, leseBody, leseIdParam } from "@/lib/dienstplan/route";

// Vorschlag verwerfen oder wieder öffnen (Planer und Admin). Übernehmen läuft
// über POST /uebernehmen (legt das Thema an). Ein übernommener Vorschlag bleibt
// übernommen.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return dienstplanRoute("Planer", async ({ tx }) => {
    const id = leseIdParam((await params).id);
    const e = pruefeVorschlagStatus(await leseBody(req));
    if (!e.ok) throw new DpFehler(400, e.fehler);
    const [v] = expectRows(await tx.execute<{ status: string }>(sql`select status::text as status from dienstplan.themenvorschlaege where id = ${id}`), "Vorschlag");
    if (v.status === "uebernommen") throw new DpFehler(409, "Der Vorschlag ist schon als Thema übernommen");
    expectRows(await tx.execute(sql`
      update dienstplan.themenvorschlaege set status = ${e.daten.status}::dienstplan.vorschlag_status where id = ${id} returning id`), "Vorschlag");
    return NextResponse.json({ ok: true });
  });
}
