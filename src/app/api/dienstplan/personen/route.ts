import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { dienstplanRoute } from "@/lib/dienstplan/route";
import { ladeAnzeigenamen } from "@/lib/dienstplan/plan";
import { anzeigenameExtern } from "@/lib/mitglieder/anzeigename";

// Auswahlliste für Verantwortliche (Planer und Admin, Spec 7.2 "Personen"):
// aktive Kameraden mit Anzeigename (nur Namensfelder aus kameraden_namen(),
// keine weiteren Personendaten) und aktive externe Personen.
export async function GET() {
  return dienstplanRoute("Planer", async ({ s, tx }) => {
    const { namen, kameraden } = await ladeAnzeigenamen(tx);
    const extern = await tx.execute<{ id: number; name: string | null; organisation: string | null }>(sql`
      select id, name, organisation from dienstplan.externe_personen
       where organisation_id = ${s.organisationId} and aktiv order by lower(coalesce(name, organisation))`);
    return NextResponse.json({
      kameraden: kameraden.filter((k) => k.aktiv)
        .map((k) => ({ id: k.id, anzeige: namen.get(k.id) ?? `${k.name}, ${k.vorname}`, name: k.name, vorname: k.vorname }))
        .sort((a, b) => a.anzeige.localeCompare(b.anzeige, "de")),
      externe: extern.map((e) => ({ id: e.id, anzeige: anzeigenameExtern(e) })),
    });
  });
}
