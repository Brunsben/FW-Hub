import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { expectRows } from "@/lib/db/rows";
import { pruefeProfil } from "@/lib/dienstplan/export";
import { listeProfile } from "@/lib/dienstplan/export-db";
import { dienstplanRoute, DpFehler, leseBody } from "@/lib/dienstplan/route";

// Exportprofile für CSV (Spec 9.5). Lesen Planer und Admin (Export), anlegen
// und ändern nur der Dienstplan-Admin (Policy export_profile_schreiben).
export async function GET() {
  return dienstplanRoute("Planer", async ({ s, tx }) => NextResponse.json({ profile: await listeProfile(tx, s.organisationId) }));
}

export async function POST(req: Request) {
  return dienstplanRoute("Admin", async ({ s, tx }) => {
    const e = pruefeProfil(await leseBody(req));
    if (!e.ok) throw new DpFehler(400, e.fehler);
    const d = e.daten;
    const [p] = expectRows(await tx.execute<{ id: number }>(sql`
      insert into dienstplan.export_profile (organisation_id, name, trennzeichen, kodierung, kopfzeile, spalten, nur_freigegeben, kategorien)
      values (${s.organisationId}, ${d.name}, ${d.trennzeichen}, ${d.kodierung}, ${d.kopfzeile}, ${JSON.stringify(d.spalten)}::jsonb,
              ${d.nurFreigegeben}, ${d.kategorien ? sql`${`{${d.kategorien.join(",")}}`}::text[]` : sql`null`})
      returning id`), "Exportprofil");
    return NextResponse.json({ id: p.id }, { status: 201 });
  });
}
