import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { expectRows } from "@/lib/db/rows";
import { pruefePlanNeu } from "@/lib/dienstplan/eingabe";
import { dienstplanRoute, DpFehler, leseBody } from "@/lib/dienstplan/route";
import { findePlan, generiereTermine, type DpPlan } from "@/lib/dienstplan/plan";

// Pläne der eigenen Organisation. Mitglieder sehen nur freigegebene (RLS
// plaene_lesen), Planer und Admin auch Entwürfe.
export async function GET() {
  return dienstplanRoute("Mitglied", async ({ s, tx }) => {
    const plaene = await tx.execute<DpPlan>(sql`
      select id, jahr, status::text as status, version,
             to_char(freigegeben_am at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "freigegebenAm",
             freigegeben_von as "freigegebenVon"
        from dienstplan.plaene where organisation_id = ${s.organisationId} order by jahr desc`);
    return NextResponse.json({ plaene: [...plaene] });
  });
}

// Neuen Plan anlegen (nur Dienstplan-Admin, Policy plaene_anlegen). Body:
// { jahr, generieren? = true }. Mit generieren legt der Generator gleich die
// Rhythmus-Termine an (Spec 5.3). Ein Plan je Jahr: sonst 409.
export async function POST(req: Request) {
  return dienstplanRoute("Admin", async ({ s, tx }) => {
    const e = pruefePlanNeu(await leseBody(req));
    if (!e.ok) throw new DpFehler(400, e.fehler);
    if (await findePlan(tx, s.organisationId, e.daten.jahr)) throw new DpFehler(409, `Plan ${e.daten.jahr} gibt es schon`);
    expectRows(await tx.execute(sql`
      insert into dienstplan.plaene (organisation_id, jahr) values (${s.organisationId}, ${e.daten.jahr}) returning id`), "Plan");
    const plan = (await findePlan(tx, s.organisationId, e.daten.jahr))!;
    const generiert = e.daten.generieren ? await generiereTermine(tx, plan, s.organisationId) : null;
    return NextResponse.json({ plan: (await findePlan(tx, s.organisationId, e.daten.jahr))!, generiert }, { status: 201 });
  });
}
