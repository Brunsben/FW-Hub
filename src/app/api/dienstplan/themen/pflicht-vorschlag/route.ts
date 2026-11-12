import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { expectRows } from "@/lib/db/rows";
import { pflichtZuordnen } from "@/lib/dienstplan/ausgleich";
import { dienstplanRoute } from "@/lib/dienstplan/route";

// Pflichtthemen-Vorschlag der Spec (7.6) übernehmen (Planer und Admin):
// Sicherheitsunterweisung, Erste Hilfe, Atemschutzunterweisung (Zielgruppe
// Atemschutzgeräteträger). Vorhandene Themen gleichen Titels bzw. bekannter
// Schreibweise werden markiert (und aktiviert), fehlende angelegt. Idempotent.
export async function POST() {
  return dienstplanRoute("Planer", async ({ s, tx }) => {
    const katalog = [...await tx.execute<{ id: number; titel: string }>(sql`
      select id, titel from dienstplan.themen where organisation_id = ${s.organisationId}`)];
    const ergebnis = [];
    for (const { vorschlag: v, themaId } of pflichtZuordnen(katalog)) {
      if (themaId) {
        expectRows(await tx.execute(sql`
          update dienstplan.themen set pflicht_jaehrlich = true, aktiv = true, zielgruppe = coalesce(zielgruppe, ${v.zielgruppe})
           where id = ${themaId} returning id`), "Thema");
        ergebnis.push({ titel: katalog.find((k) => k.id === themaId)!.titel, themaId, neu: false });
      } else {
        const [t] = expectRows(await tx.execute<{ id: number }>(sql`
          insert into dienstplan.themen (organisation_id, titel, pflicht_jaehrlich, zielgruppe)
          values (${s.organisationId}, ${v.titel}, true, ${v.zielgruppe}) returning id`), "Thema");
        ergebnis.push({ titel: v.titel, themaId: t.id, neu: true });
      }
    }
    return NextResponse.json({ themen: ergebnis });
  });
}
