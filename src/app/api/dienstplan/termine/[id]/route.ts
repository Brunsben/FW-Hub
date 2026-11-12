import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { expectRows } from "@/lib/db/rows";
import { pruefeTermin } from "@/lib/dienstplan/eingabe";
import { dienstplanRoute, DpFehler, leseBody, leseIdParam } from "@/lib/dienstplan/route";
import { ladeTerminKopf } from "@/lib/dienstplan/plan";
import { pruefeKategorie, setListe } from "@/lib/dienstplan/termin";

type Ctx = { params: Promise<{ id: string }> };

const SPALTEN = {
  datum: "datum", uhrzeit: "uhrzeit", dauerMinuten: "dauer_minuten", kategorieId: "kategorie_id",
  ausgefallen: "ausgefallen", ort: "ort", bemerkung: "bemerkung", notizen: "notizen",
};

// Termin ändern (Planer und Admin). Ein verschobener Rhythmus-Termin behält sein
// rhythmus_datum, der Generator legt ihn daher nicht erneut an. Absagen =
// { ausgefallen: true } (Grund in bemerkung).
export async function PATCH(req: Request, { params }: Ctx) {
  return dienstplanRoute("Planer", async ({ s, tx }) => {
    const termin = await ladeTerminKopf(tx, leseIdParam((await params).id));
    const e = pruefeTermin(await leseBody(req), "aendern");
    if (!e.ok) throw new DpFehler(400, e.fehler);
    const t = e.daten;
    if (t.datum && Number(t.datum.slice(0, 4)) !== termin.jahr) throw new DpFehler(400, `Datum liegt nicht im Planjahr ${termin.jahr}`);
    if (t.kategorieId) await pruefeKategorie(tx, s.organisationId, t.kategorieId);
    expectRows(await tx.execute(sql`update dienstplan.termine set ${setListe({ ...t }, SPALTEN)} where id = ${termin.id} returning id`), "Termin");
    return NextResponse.json({ ok: true });
  });
}

// Termin löschen (Planer und Admin), nur manuelle Termine. Rhythmus-Termine
// würde der Generator wieder anlegen; sie werden abgesagt (ausgefallen).
export async function DELETE(_req: Request, { params }: Ctx) {
  return dienstplanRoute("Planer", async ({ tx }) => {
    const termin = await ladeTerminKopf(tx, leseIdParam((await params).id));
    if (termin.quelle === "rhythmus") throw new DpFehler(409, "Rhythmus-Termine werden nicht gelöscht, sondern abgesagt (ausgefallen)");
    expectRows(await tx.execute(sql`delete from dienstplan.termine where id = ${termin.id} returning id`), "Termin");
    return NextResponse.json({ ok: true });
  });
}
