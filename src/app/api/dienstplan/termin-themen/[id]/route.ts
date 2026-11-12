import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { expectRows } from "@/lib/db/rows";
import { pruefeTerminThemaAendern } from "@/lib/dienstplan/eingabe";
import { dienstplanRoute, DpFehler, leseBody, leseIdParam } from "@/lib/dienstplan/route";
import type { ScopedTx } from "@/lib/db/scoped";
import { ladeTerminKopf, naechsteThemenPosition, themenNeuNummerieren } from "@/lib/dienstplan/plan";

type Ctx = { params: Promise<{ id: string }> };

async function ladeTerminThema(tx: ScopedTx, id: number) {
  const [tt] = expectRows(await tx.execute<{ id: number; terminId: number }>(sql`
    select id, termin_id as "terminId" from dienstplan.termin_themen where id = ${id}`), "Termin-Thema");
  return tt;
}

// Themenposition verschieben (Planer und Admin). Body: { position?, terminId? }
//   nur position: Reihenfolge im selben Termin (1 = vorne)
//   terminId:     in einen anderen Termin desselben Plans, samt Verantwortlichen;
//                 ohne position ans Ende
// Die Positionen beider Termine werden danach lückenlos neu nummeriert.
export async function PATCH(req: Request, { params }: Ctx) {
  return dienstplanRoute("Planer", async ({ tx }) => {
    const tt = await ladeTerminThema(tx, leseIdParam((await params).id));
    const e = pruefeTerminThemaAendern(await leseBody(req));
    if (!e.ok) throw new DpFehler(400, e.fehler);
    const quelle = await ladeTerminKopf(tx, tt.terminId);
    const zielId = e.daten.terminId ?? tt.terminId;
    if (zielId !== tt.terminId) {
      const ziel = await ladeTerminKopf(tx, zielId);
      if (ziel.planId !== quelle.planId) throw new DpFehler(400, "Themen nur innerhalb desselben Plans verschieben");
      const ende = await naechsteThemenPosition(tx, ziel.id);
      expectRows(await tx.execute(sql`
        update dienstplan.termin_themen set termin_id = ${ziel.id}, position = ${ende} where id = ${tt.id} returning id`), "Termin-Thema");
      await themenNeuNummerieren(tx, quelle.id);
    }
    await themenNeuNummerieren(tx, zielId, e.daten.position ? { id: tt.id, position: e.daten.position } : undefined);
    return NextResponse.json({ ok: true });
  });
}

// Themenposition entfernen (samt Verantwortlichen, ON DELETE CASCADE).
export async function DELETE(_req: Request, { params }: Ctx) {
  return dienstplanRoute("Planer", async ({ tx }) => {
    const tt = await ladeTerminThema(tx, leseIdParam((await params).id));
    expectRows(await tx.execute(sql`delete from dienstplan.termin_themen where id = ${tt.id} returning id`), "Termin-Thema");
    await themenNeuNummerieren(tx, tt.terminId);
    return NextResponse.json({ ok: true });
  });
}
