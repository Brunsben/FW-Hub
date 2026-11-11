import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { expectRows } from "@/lib/db/rows";
import { pruefeUebernehmen } from "@/lib/dienstplan/eingabe";
import { dienstplanRoute, DpFehler, leseBody, leseIdParam } from "@/lib/dienstplan/route";
import { ladeTerminKopf, naechsteThemenPosition } from "@/lib/dienstplan/plan";

// Vorschlag als Thema übernehmen (Planer und Admin, Spec 7.2 "Pool").
// Gibt es im Katalog schon ein Thema mit gleichem Titel (ohne Groß/klein), wird
// es verwendet (und ggf. wieder aktiviert), sonst neu angelegt (Beschreibung →
// Notizen). Der Vorschlag wird "uebernommen" und verweist auf das Thema.
// Body { terminId? }: zusätzlich ans Ende dieses Termins (Ziehen auf einen Termin).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return dienstplanRoute("Planer", async ({ s, tx }) => {
    const id = leseIdParam((await params).id);
    const e = pruefeUebernehmen(await leseBody(req));
    if (!e.ok) throw new DpFehler(400, e.fehler);
    const [v] = expectRows(await tx.execute<{ titel: string; beschreibung: string | null; status: string }>(sql`
      select titel, beschreibung, status::text as status from dienstplan.themenvorschlaege where id = ${id} for update`), "Vorschlag");
    if (v.status !== "offen") throw new DpFehler(409, v.status === "uebernommen" ? "Der Vorschlag ist schon übernommen" : "Der Vorschlag ist verworfen; erst wieder öffnen");
    const termin = e.daten.terminId ? await ladeTerminKopf(tx, e.daten.terminId) : null;

    const [vorhanden] = await tx.execute<{ id: number; aktiv: boolean }>(sql`
      select id, aktiv from dienstplan.themen where organisation_id = ${s.organisationId} and lower(titel) = lower(${v.titel})`);
    let themaId: number;
    if (vorhanden) {
      themaId = vorhanden.id;
      if (!vorhanden.aktiv) expectRows(await tx.execute(sql`update dienstplan.themen set aktiv = true where id = ${themaId} returning id`), "Thema");
    } else {
      const [t] = expectRows(await tx.execute<{ id: number }>(sql`
        insert into dienstplan.themen (organisation_id, titel, notizen) values (${s.organisationId}, ${v.titel}, ${v.beschreibung}) returning id`), "Thema");
      themaId = t.id;
    }
    expectRows(await tx.execute(sql`
      update dienstplan.themenvorschlaege set status = 'uebernommen', thema_id = ${themaId} where id = ${id} returning id`), "Vorschlag");
    let terminThemaId: number | null = null;
    if (termin) {
      const [tt] = expectRows(await tx.execute<{ id: number }>(sql`
        insert into dienstplan.termin_themen (termin_id, thema_id, position)
        values (${termin.id}, ${themaId}, ${await naechsteThemenPosition(tx, termin.id)}) returning id`), "Termin-Thema");
      terminThemaId = tt.id;
    }
    return NextResponse.json({ themaId, terminThemaId, neuesThema: !vorhanden }, { status: 201 });
  });
}
