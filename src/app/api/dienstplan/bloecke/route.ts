import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { expectRows } from "@/lib/db/rows";
import { pruefeBlock } from "@/lib/dienstplan/eingabe";
import { dienstplanRoute, DpFehler, leseBody } from "@/lib/dienstplan/route";
import { schreibeBlockThemen } from "@/lib/dienstplan/bloecke";

// Themenblöcke mit ihren Themen in Reihenfolge. Lesen: jede angemeldete Person.
export async function GET() {
  return dienstplanRoute("Mitglied", async ({ s, tx }) => {
    const bloecke = await tx.execute(sql`
      select b.id, b.name, b.aktiv,
             coalesce(json_agg(json_build_object('themaId', p.thema_id, 'titel', th.titel, 'position', p.position)
                               order by p.position, p.id) filter (where p.id is not null), '[]') as themen
        from dienstplan.themenbloecke b
        left join dienstplan.themenblock_positionen p on p.block_id = b.id
        left join dienstplan.themen th on th.id = p.thema_id
       where b.organisation_id = ${s.organisationId}
       group by b.id order by lower(b.name)`);
    return NextResponse.json({ bloecke: [...bloecke] });
  });
}

// Block anlegen (Planer und Admin). Body: { name, themaIds: [2..20 Themen], aktiv? }
export async function POST(req: Request) {
  return dienstplanRoute("Planer", async ({ s, tx }) => {
    const e = pruefeBlock(await leseBody(req), "neu");
    if (!e.ok) throw new DpFehler(400, e.fehler);
    const [r] = expectRows(await tx.execute<{ id: number }>(sql`
      insert into dienstplan.themenbloecke (organisation_id, name, aktiv)
      values (${s.organisationId}, ${e.daten.name}, ${e.daten.aktiv ?? true}) returning id`), "Block");
    await schreibeBlockThemen(tx, s.organisationId, r.id, e.daten.themaIds!);
    return NextResponse.json({ id: r.id }, { status: 201 });
  });
}
