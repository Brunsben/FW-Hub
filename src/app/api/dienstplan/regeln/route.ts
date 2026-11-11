import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { expectRows } from "@/lib/db/rows";
import { pruefeRegel, pruefeRegelVollstaendig } from "@/lib/dienstplan/eingabe";
import { dienstplanRoute, DpFehler, leseBody } from "@/lib/dienstplan/route";
import { ladeRegeln } from "@/lib/dienstplan/plan";
import { regelSql } from "@/lib/dienstplan/regeln";

// Rhythmusregeln (Spec 5, 7.5). Lesen: Planer und Admin (Policy
// rhythmus_regeln_lesen), Schreiben: nur Dienstplan-Admin.
export async function GET() {
  return dienstplanRoute("Planer", async ({ s, tx }) => NextResponse.json({ regeln: await ladeRegeln(tx, s.organisationId) }));
}

// Regel anlegen. Body siehe RegelEingabe (lib/dienstplan/eingabe.ts); je Typ
// Pflichtangaben: wochen_zyklus → ankerDatum, muster; monats_wochentag →
// nterWochentag, monate, kategorieKuerzel.
export async function POST(req: Request) {
  return dienstplanRoute("Admin", async ({ s, tx }) => {
    const e = pruefeRegel(await leseBody(req), "neu");
    if (!e.ok) throw new DpFehler(400, e.fehler);
    const fehlt = pruefeRegelVollstaendig(e.daten);
    if (fehlt) throw new DpFehler(400, fehlt);
    const r = regelSql(e.daten);
    const [neu] = expectRows(await tx.execute<{ id: number }>(sql`
      insert into dienstplan.rhythmus_regeln
        (organisation_id, name, typ, wochentag, uhrzeit, anker_datum, muster, nter_wochentag, monate, kategorie_kuerzel, gueltig_ab, gueltig_bis, aktiv)
      values (${s.organisationId}, ${r.name}, ${r.typ}, ${r.wochentag}, ${r.uhrzeit}, ${r.ankerDatum}, ${r.muster},
              ${r.nterWochentag}, ${r.monate}, ${r.kategorieKuerzel}, ${r.gueltigAb}, ${r.gueltigBis}, ${r.aktiv})
      returning id`), "Regel");
    return NextResponse.json({ id: neu.id }, { status: 201 });
  });
}
