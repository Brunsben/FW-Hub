import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { dienstplanRoute, DpFehler } from "@/lib/dienstplan/route";
import { feiertageNiedersachsen, plusTage, regelnMitVersatz, rhythmusTreffer } from "@/lib/dienstplan/kalender";
import { ladeRegeln } from "@/lib/dienstplan/plan";

// Vorschau beim Anlegen eines Jahres (Spec 5.2a, Planer und Admin):
//   ?jahr=2027&versatz=0|2&wochen=8
// Liefert die Rhythmus-Termine der ersten `wochen` Wochen, wie sie mit dem
// gewählten Zwischendienst-Versatz entstünden (nichts wird geschrieben), dazu die
// letzten Rhythmus-Termine des Vorjahres, damit der Übergang sichtbar ist.
export async function GET(req: Request) {
  return dienstplanRoute("Planer", async ({ s, tx }) => {
    const q = new URL(req.url).searchParams;
    const jahr = Number(q.get("jahr"));
    const versatz = Number(q.get("versatz") ?? 0);
    const wochen = Number(q.get("wochen") ?? 8);
    if (!Number.isInteger(jahr) || jahr < 2000 || jahr > 2100) throw new DpFehler(400, "Ungültiges Jahr");
    if (!Number.isInteger(versatz) || versatz < 0 || versatz > 3) throw new DpFehler(400, "versatz muss 0 bis 3 sein");
    if (!Number.isInteger(wochen) || wochen < 1 || wochen > 53) throw new DpFehler(400, "wochen muss 1 bis 53 sein");

    const { regeln, fehler } = regelnMitVersatz((await ladeRegeln(tx, s.organisationId)).filter((r) => r.aktiv), jahr, "Z", versatz);
    const bis = plusTage(`${jahr}-01-01`, wochen * 7);
    const feiertage = feiertageNiedersachsen(jahr);
    const termine = rhythmusTreffer(regeln, jahr)
      .filter((t) => t.datum < bis)
      .map((t) => ({ datum: t.datum, kuerzel: t.kuerzel, uhrzeit: t.uhrzeit, feiertag: feiertage.get(t.datum) ?? null }));
    const vorjahr = await tx.execute<{ datum: string; kuerzel: string; ausgefallen: boolean }>(sql`
      select t.datum::text as datum, k.kuerzel, t.ausgefallen
        from dienstplan.termine t
        join dienstplan.plaene p on p.id = t.plan_id
        join dienstplan.kategorien k on k.id = t.kategorie_id
       where p.organisation_id = ${s.organisationId} and p.jahr = ${jahr - 1}
         and k.kuerzel in ('D', 'Z') and extract(isodow from t.datum) = 2
       order by t.datum desc limit 6`);
    return NextResponse.json({
      jahr, versatz, termine,
      vorjahr: [...vorjahr].reverse(),
      moeglich: fehler.length === 0,
      fehler: fehler.map((r) => `${r.name}: Zielwoche belegt`),
    });
  });
}
