import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { expectRows } from "@/lib/db/rows";
import { pruefeBlock } from "@/lib/dienstplan/eingabe";
import { dienstplanRoute, DpFehler, leseBody, leseIdParam } from "@/lib/dienstplan/route";
import { schreibeBlockThemen } from "@/lib/dienstplan/bloecke";
import { setListe } from "@/lib/dienstplan/termin";

type Ctx = { params: Promise<{ id: string }> };

// Block ändern (Planer und Admin): name, aktiv, themaIds (ersetzt die Themen).
// Termine, die den Block schon nutzen, bleiben unverändert.
export async function PATCH(req: Request, { params }: Ctx) {
  return dienstplanRoute("Planer", async ({ s, tx }) => {
    const id = leseIdParam((await params).id);
    const e = pruefeBlock(await leseBody(req), "aendern");
    if (!e.ok) throw new DpFehler(400, e.fehler);
    const { themaIds, ...rest } = e.daten;
    expectRows(await tx.execute(sql`select id from dienstplan.themenbloecke where id = ${id} and organisation_id = ${s.organisationId}`), "Block");
    if (Object.keys(rest).length) {
      expectRows(await tx.execute(sql`update dienstplan.themenbloecke set ${setListe(rest, { name: "name", aktiv: "aktiv" })} where id = ${id} returning id`), "Block");
    }
    if (themaIds) await schreibeBlockThemen(tx, s.organisationId, id, themaIds);
    return NextResponse.json({ ok: true });
  });
}

// Block löschen (Planer und Admin), nur wenn kein Termin ihn verwendet. Sonst 409:
// stattdessen deaktivieren (aktiv = false).
export async function DELETE(_req: Request, { params }: Ctx) {
  return dienstplanRoute("Planer", async ({ s, tx }) => {
    const id = leseIdParam((await params).id);
    const [benutzt] = await tx.execute(sql`select 1 from dienstplan.termin_themen where aus_block_id = ${id} limit 1`);
    if (benutzt) throw new DpFehler(409, "Block wird in Plänen verwendet; stattdessen deaktivieren");
    expectRows(await tx.execute(sql`delete from dienstplan.themenbloecke where id = ${id} and organisation_id = ${s.organisationId} returning id`), "Block");
    return NextResponse.json({ ok: true });
  });
}
