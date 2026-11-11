import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { expectRows } from "@/lib/db/rows";
import { pruefeRegel, pruefeRegelVollstaendig, type RegelEingabe } from "@/lib/dienstplan/eingabe";
import { dienstplanRoute, DpFehler, leseBody, leseIdParam } from "@/lib/dienstplan/route";
import { ladeRegeln } from "@/lib/dienstplan/plan";
import { regelSql } from "@/lib/dienstplan/regeln";

// Regel ändern (nur Dienstplan-Admin). Der Body wird mit dem gespeicherten Stand
// zusammengeführt und danach als Ganzes geprüft. Bestehende Termine bleiben
// unverändert; der Generator nutzt die Regel beim nächsten Lauf. Gelöscht wird
// nicht (Termine verweisen darauf), stattdessen aktiv = false oder gueltigBis.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return dienstplanRoute("Admin", async ({ s, tx }) => {
    const id = leseIdParam((await params).id);
    const alt = (await ladeRegeln(tx, s.organisationId)).find((r) => r.id === id);
    if (!alt) throw new DpFehler(404, "Regel nicht gefunden");
    const e = pruefeRegel(await leseBody(req), "aendern");
    if (!e.ok) throw new DpFehler(400, e.fehler);
    const neu: RegelEingabe = { ...alt, ...e.daten };
    const fehlt = pruefeRegelVollstaendig(neu);
    if (fehlt) throw new DpFehler(400, fehlt);
    const r = regelSql(neu);
    expectRows(await tx.execute(sql`
      update dienstplan.rhythmus_regeln
         set name = ${r.name}, typ = ${r.typ}, wochentag = ${r.wochentag}, uhrzeit = ${r.uhrzeit},
             anker_datum = ${r.ankerDatum}, muster = ${r.muster}, nter_wochentag = ${r.nterWochentag},
             monate = ${r.monate}, kategorie_kuerzel = ${r.kategorieKuerzel}, gueltig_ab = ${r.gueltigAb},
             gueltig_bis = ${r.gueltigBis}, aktiv = ${r.aktiv}
       where id = ${id} and organisation_id = ${s.organisationId} returning id`), "Regel");
    return NextResponse.json({ ok: true });
  });
}
