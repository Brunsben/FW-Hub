import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { expectRows } from "@/lib/db/rows";
import { ANZEIGE_GUELTIG_STUNDEN, neuesAnzeigeToken } from "@/lib/dienstplan/anzeige";
import { dienstplanRoute, leseJahrParam } from "@/lib/dienstplan/route";
import { planOder404 } from "@/lib/dienstplan/plan";

type Ctx = { params: Promise<{ jahr: string }> };

const ZEIT = (spalte: string) => sql.raw(`to_char(${spalte} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`);

// Anzeige-Links eines Plans (Planer und Admin).
// GET: aktive Links (ohne Token, das gibt es nur einmal bei POST).
export async function GET(_req: Request, { params }: Ctx) {
  return dienstplanRoute("Planer", async ({ s, tx }) => {
    const plan = await planOder404(tx, s.organisationId, leseJahrParam((await params).jahr));
    const links = await tx.execute<{ id: number; gueltigBis: string; erstelltAm: string }>(sql`
      select id, ${ZEIT("gueltig_bis")} as "gueltigBis", ${ZEIT("erstellt_am")} as "erstelltAm"
        from dienstplan.anzeige_tokens where plan_id = ${plan.id} and gueltig_bis > now() order by gueltig_bis desc`);
    return NextResponse.json({ links: [...links] });
  });
}

// POST: neuer Link, gültig 12 Stunden. Abgelaufene Links der Organisation
// werden dabei gelöscht. Antwort enthält das Token genau einmal.
export async function POST(_req: Request, { params }: Ctx) {
  return dienstplanRoute("Planer", async ({ s, tx }) => {
    const plan = await planOder404(tx, s.organisationId, leseJahrParam((await params).jahr));
    await tx.execute(sql`delete from dienstplan.anzeige_tokens where organisation_id = ${s.organisationId} and gueltig_bis <= now()`);
    const { token, hash } = neuesAnzeigeToken();
    const [t] = expectRows(await tx.execute<{ id: number; gueltigBis: string }>(sql`
      insert into dienstplan.anzeige_tokens (organisation_id, plan_id, token_hash, gueltig_bis, erstellt_von)
      values (${s.organisationId}, ${plan.id}, ${hash}, now() + make_interval(hours => ${ANZEIGE_GUELTIG_STUNDEN}), ${s.kameradId})
      returning id, ${ZEIT("gueltig_bis")} as "gueltigBis"`), "Anzeige-Link");
    return NextResponse.json({ id: t.id, token, gueltigBis: t.gueltigBis, jahr: plan.jahr }, { status: 201, headers: { "Cache-Control": "no-store" } });
  });
}

// DELETE: alle Links dieses Plans sofort beenden.
export async function DELETE(_req: Request, { params }: Ctx) {
  return dienstplanRoute("Planer", async ({ s, tx }) => {
    const plan = await planOder404(tx, s.organisationId, leseJahrParam((await params).jahr));
    const r = await tx.execute(sql`delete from dienstplan.anzeige_tokens where plan_id = ${plan.id} returning id`);
    return NextResponse.json({ beendet: r.length });
  });
}
