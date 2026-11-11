import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { expectRows } from "@/lib/db/rows";
import { pruefeTerminThema } from "@/lib/dienstplan/eingabe";
import { dienstplanRoute, DpFehler, leseBody, leseIdParam } from "@/lib/dienstplan/route";
import { ladeTerminKopf, naechsteThemenPosition } from "@/lib/dienstplan/plan";

// Thema an einen Termin hängen (Planer und Admin), immer ans Ende.
// Body: genau eins von
//   { themaId }        Thema aus dem Katalog (aktiv)
//   { titelFreitext }  Sondertermin ohne Katalogeintrag ("Weihnachtsfeier")
//   { blockId }        alle Themen des Blocks in Blockreihenfolge, aus_block_id gesetzt
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return dienstplanRoute("Planer", async ({ s, tx }) => {
    const termin = await ladeTerminKopf(tx, leseIdParam((await params).id));
    const e = pruefeTerminThema(await leseBody(req));
    if (!e.ok) throw new DpFehler(400, e.fehler);
    let pos = await naechsteThemenPosition(tx, termin.id);
    const ids: number[] = [];
    const einfuegen = async (themaId: number | null, freitext: string | null, blockId: number | null) => {
      const [r] = expectRows(await tx.execute<{ id: number }>(sql`
        insert into dienstplan.termin_themen (termin_id, thema_id, titel_freitext, position, aus_block_id)
        values (${termin.id}, ${themaId}, ${freitext}, ${pos++}, ${blockId}) returning id`), "Termin-Thema");
      ids.push(r.id);
    };
    const d = e.daten;
    if (d.art === "thema") {
      const [th] = await tx.execute<{ aktiv: boolean }>(sql`select aktiv from dienstplan.themen where id = ${d.themaId} and organisation_id = ${s.organisationId}`);
      if (!th) throw new DpFehler(400, "Thema nicht gefunden");
      if (!th.aktiv) throw new DpFehler(400, "Thema ist nicht aktiv");
      await einfuegen(d.themaId, null, null);
    } else if (d.art === "freitext") {
      await einfuegen(null, d.titel, null);
    } else {
      const [b] = await tx.execute<{ aktiv: boolean }>(sql`select aktiv from dienstplan.themenbloecke where id = ${d.blockId} and organisation_id = ${s.organisationId}`);
      if (!b) throw new DpFehler(400, "Block nicht gefunden");
      if (!b.aktiv) throw new DpFehler(400, "Block ist nicht aktiv");
      const themen = await tx.execute<{ themaId: number }>(sql`
        select thema_id as "themaId" from dienstplan.themenblock_positionen where block_id = ${d.blockId} order by position, id`);
      if (!themen.length) throw new DpFehler(400, "Block enthält keine Themen");
      for (const t of themen) await einfuegen(t.themaId, null, d.blockId);
    }
    return NextResponse.json({ ids }, { status: 201 });
  });
}
