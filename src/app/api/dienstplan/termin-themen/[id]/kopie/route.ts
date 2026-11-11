import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { expectRows } from "@/lib/db/rows";
import { pruefeTerminThemaAendern } from "@/lib/dienstplan/eingabe";
import { dienstplanRoute, DpFehler, leseBody, leseIdParam } from "@/lib/dienstplan/route";
import { ladeTerminKopf, naechsteThemenPosition, themenNeuNummerieren } from "@/lib/dienstplan/plan";

// Themenposition samt Verantwortlichen in einen Termin kopieren (Drag and Drop
// mit Alt-Taste, Spec 7.2). Planer und Admin. Body: { terminId, position? };
// ohne position ans Ende. Nur innerhalb desselben Plans.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return dienstplanRoute("Planer", async ({ tx }) => {
    const [tt] = expectRows(await tx.execute<{ id: number; terminId: number; themaId: number | null; freitext: string | null; blockId: number | null }>(sql`
      select id, termin_id as "terminId", thema_id as "themaId", titel_freitext as freitext, aus_block_id as "blockId"
        from dienstplan.termin_themen where id = ${leseIdParam((await params).id)}`), "Termin-Thema");
    const e = pruefeTerminThemaAendern(await leseBody(req));
    if (!e.ok) throw new DpFehler(400, e.fehler);
    if (!e.daten.terminId) throw new DpFehler(400, "terminId fehlt");
    const quelle = await ladeTerminKopf(tx, tt.terminId);
    const ziel = await ladeTerminKopf(tx, e.daten.terminId);
    if (ziel.planId !== quelle.planId) throw new DpFehler(400, "Themen nur innerhalb desselben Plans kopieren");
    const [neu] = expectRows(await tx.execute<{ id: number }>(sql`
      insert into dienstplan.termin_themen (termin_id, thema_id, titel_freitext, position, aus_block_id)
      values (${ziel.id}, ${tt.themaId}, ${tt.freitext}, ${await naechsteThemenPosition(tx, ziel.id)}, ${tt.blockId}) returning id`), "Termin-Thema");
    await tx.execute(sql`
      insert into dienstplan.termin_verantwortliche (termin_thema_id, kamerad_id, externe_person_id, platzhalter, position)
      select ${neu.id}, kamerad_id, externe_person_id, platzhalter, position
        from dienstplan.termin_verantwortliche where termin_thema_id = ${tt.id}`);
    if (e.daten.position) await themenNeuNummerieren(tx, ziel.id, { id: neu.id, position: e.daten.position });
    return NextResponse.json({ id: neu.id }, { status: 201 });
  });
}
