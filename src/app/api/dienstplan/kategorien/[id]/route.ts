import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { expectRows } from "@/lib/db/rows";
import { pruefeKategorie } from "@/lib/dienstplan/eingabe";
import { dienstplanRoute, DpFehler, leseBody, leseIdParam } from "@/lib/dienstplan/route";
import { setListe } from "@/lib/dienstplan/termin";

const SPALTEN = {
  kuerzel: "kuerzel", name: "name", farbe: "farbe", standardUhrzeit: "standard_uhrzeit",
  standardDauerMinuten: "standard_dauer_minuten", sortierung: "sortierung", aktiv: "aktiv",
};

// Kategorie ändern (nur Dienstplan-Admin). Ein geändertes Kürzel wirkt auf
// Regeln, die es nennen, erst nach deren Anpassung (Muster/kategorie_kuerzel).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return dienstplanRoute("Admin", async ({ s, tx }) => {
    const id = leseIdParam((await params).id);
    const e = pruefeKategorie(await leseBody(req), "aendern");
    if (!e.ok) throw new DpFehler(400, e.fehler);
    expectRows(await tx.execute(sql`
      update dienstplan.kategorien set ${setListe({ ...e.daten }, SPALTEN)}
       where id = ${id} and organisation_id = ${s.organisationId} returning id`), "Kategorie");
    return NextResponse.json({ ok: true });
  });
}
