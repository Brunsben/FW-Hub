import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { expectRows } from "@/lib/db/rows";
import { pruefeThema } from "@/lib/dienstplan/eingabe";
import { dienstplanRoute, DpFehler, leseBody, leseIdParam } from "@/lib/dienstplan/route";
import { setListe } from "@/lib/dienstplan/termin";

const SPALTEN = {
  titel: "titel", kurztitel: "kurztitel", bereichId: "bereich_id", notizen: "notizen",
  pflichtJaehrlich: "pflicht_jaehrlich", zielgruppe: "zielgruppe", aktiv: "aktiv",
};

// Thema ändern (Planer und Admin). Gelöscht wird nicht: Themen hängen an alten
// Plänen und Blöcken, stattdessen aktiv = false.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return dienstplanRoute("Planer", async ({ s, tx }) => {
    const id = leseIdParam((await params).id);
    const e = pruefeThema(await leseBody(req), "aendern");
    if (!e.ok) throw new DpFehler(400, e.fehler);
    if (e.daten.titel) {
      const [doppelt] = await tx.execute(sql`select 1 from dienstplan.themen where organisation_id = ${s.organisationId} and lower(titel) = lower(${e.daten.titel}) and id <> ${id}`);
      if (doppelt) throw new DpFehler(409, "Ein Thema mit diesem Titel gibt es schon");
    }
    expectRows(await tx.execute(sql`
      update dienstplan.themen set ${setListe({ ...e.daten }, SPALTEN)}
       where id = ${id} and organisation_id = ${s.organisationId} returning id`), "Thema");
    return NextResponse.json({ ok: true });
  });
}
