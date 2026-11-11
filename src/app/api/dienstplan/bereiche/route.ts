import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { expectRows } from "@/lib/db/rows";
import { pruefeBereich } from "@/lib/dienstplan/eingabe";
import { dienstplanRoute, DpFehler, leseBody } from "@/lib/dienstplan/route";

// Bereiche des Themenkatalogs (Brandbekämpfung, TH, …). Lesen jede angemeldete
// Person, Schreiben Planer und Admin. Name je Organisation eindeutig (409).
export async function GET() {
  return dienstplanRoute("Mitglied", async ({ s, tx }) => {
    const bereiche = await tx.execute(sql`
      select id, name, sortierung from dienstplan.bereiche where organisation_id = ${s.organisationId} order by sortierung, lower(name)`);
    return NextResponse.json({ bereiche: [...bereiche] });
  });
}

export async function POST(req: Request) {
  return dienstplanRoute("Planer", async ({ s, tx }) => {
    const e = pruefeBereich(await leseBody(req), "neu");
    if (!e.ok) throw new DpFehler(400, e.fehler);
    const [r] = expectRows(await tx.execute<{ id: number }>(sql`
      insert into dienstplan.bereiche (organisation_id, name, sortierung)
      values (${s.organisationId}, ${e.daten.name}, ${e.daten.sortierung ?? 0}) returning id`), "Bereich");
    return NextResponse.json({ id: r.id }, { status: 201 });
  });
}
