import { NextRequest, NextResponse } from "next/server";
import { leseVersionNummer } from "@/lib/dienstplan/eingabe";
import { dienstplanRoute, DpFehler, leseJahrParam } from "@/lib/dienstplan/route";
import { letzteFreigabe, planOder404 } from "@/lib/dienstplan/plan";
import { aktuellesAbbild, ladeVersion } from "@/lib/dienstplan/versionen-db";
import { vergleiche, zusammenfassung } from "@/lib/dienstplan/versionen";

type Ctx = { params: Promise<{ jahr: string }> };

// Vergleich zweier Stände (Spec 8, Planer und Admin):
//   ?von=<nummer>&bis=<nummer|aktuell>
// Ohne von: letzte Freigabe ("Änderungen seit Freigabe"); ohne bis: aktuell.
// Ergebnis: Termine neu, entfallen, verschoben, geändert (mit Einzelheiten).
export async function GET(req: NextRequest, { params }: Ctx) {
  return dienstplanRoute("Planer", async ({ s, tx }) => {
    const plan = await planOder404(tx, s.organisationId, leseJahrParam((await params).jahr));
    const q = req.nextUrl.searchParams;
    const vonRoh = q.get("von");
    const bisRoh = q.get("bis");
    const von = vonRoh === null ? null : leseVersionNummer(vonRoh, false);
    const bis = bisRoh === null ? "aktuell" : leseVersionNummer(bisRoh, true);
    if ((vonRoh !== null && von === null) || bis === null) throw new DpFehler(400, "Ungültige Versionsnummer");
    let alt;
    let vonNummer: number;
    if (typeof von === "number") {
      alt = (await ladeVersion(tx, plan.id, von)).inhalt;
      vonNummer = von;
    } else {
      const f = await letzteFreigabe(tx, plan.id);
      if (!f) throw new DpFehler(404, "Noch keine Freigabe-Version zum Vergleichen");
      alt = f.inhalt;
      vonNummer = f.nummer;
    }
    const neu = bis === "aktuell" ? await aktuellesAbbild(tx, plan) : (await ladeVersion(tx, plan.id, bis)).inhalt;
    const aenderungen = vergleiche(alt.termine, neu.termine);
    return NextResponse.json({ von: vonNummer, bis, zusammenfassung: zusammenfassung(aenderungen), aenderungen });
  });
}
