import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { expectRows } from "@/lib/db/rows";
import { pruefeExternePerson } from "@/lib/dienstplan/eingabe";
import { dienstplanRoute, DpFehler, istDienstPlaner, leseBody } from "@/lib/dienstplan/route";
import { anzeigenameExtern } from "@/lib/mitglieder/anzeigename";

// Externe Personen und Organisationen. Lesen: jede angemeldete Person (Namen
// stehen im Plan), die E-Mail-Adresse nur Planer und Admin (Projektion hier).
export async function GET() {
  return dienstplanRoute("Mitglied", async ({ s, tx }) => {
    const rows = await tx.execute<{ id: number; name: string | null; organisation: string | null; funktion: string | null; email: string | null; aktiv: boolean }>(sql`
      select id, name, organisation, funktion, email, aktiv from dienstplan.externe_personen
       where organisation_id = ${s.organisationId} order by lower(coalesce(name, organisation))`);
    const planer = istDienstPlaner(s.rolle);
    const personen = rows.map(({ email, ...p }) => ({ ...p, anzeige: anzeigenameExtern(p), ...(planer ? { email } : {}) }));
    return NextResponse.json({ personen });
  });
}

// Externe Person anlegen (Planer und Admin). Body: { name?, organisation?, funktion?, email? }
export async function POST(req: Request) {
  return dienstplanRoute("Planer", async ({ s, tx }) => {
    const e = pruefeExternePerson(await leseBody(req), "neu");
    if (!e.ok) throw new DpFehler(400, e.fehler);
    const p = e.daten;
    const [r] = expectRows(await tx.execute<{ id: number }>(sql`
      insert into dienstplan.externe_personen (organisation_id, name, organisation, funktion, email, aktiv)
      values (${s.organisationId}, ${p.name ?? null}, ${p.organisation ?? null}, ${p.funktion ?? null}, ${p.email ?? null}, ${p.aktiv ?? true})
      returning id`), "Externe Person");
    return NextResponse.json({ id: r.id }, { status: 201 });
  });
}
