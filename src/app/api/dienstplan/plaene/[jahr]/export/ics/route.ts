import { NextResponse } from "next/server";
import { aenderungsExport, icalKalender, imHalbjahr, standText, type ExportTermin } from "@/lib/dienstplan/export";
import {
  dateiAntwort, ladeExportTermine, leseHalbjahr, leseKuerzel, leseModus, letzterLauf, protokolliere,
} from "@/lib/dienstplan/export-db";
import { planOder404 } from "@/lib/dienstplan/plan";
import { dienstplanRoute, DpFehler, istDienstPlaner, leseBody, leseJahrParam } from "@/lib/dienstplan/route";

type Ctx = { params: Promise<{ jahr: string }> };

// .ics-Download (Spec 9.4) für Jahr oder Halbjahr, optional nach Kategorien.
//   POST { modus?: "komplett" | "aenderungen", halbjahr?: 1 | 2, kategorien?: ["D", "Z"] }
// Mitglieder: nur freigegebene Pläne (RLS), nur komplett, ohne Protokoll.
// Planer: zusätzlich "nur Änderungen seit dem letzten iCal-Export" (protokolliert).
// Stabile UIDs dienstplan-<terminId>@ofwietmarschen.org, SEQUENCE steigt mit
// jeder Änderung, abgesagte Termine mit STATUS:CANCELLED.
export async function POST(req: Request, { params }: Ctx) {
  return dienstplanRoute("Mitglied", async ({ s, tx }) => {
    const plan = await planOder404(tx, s.organisationId, leseJahrParam((await params).jahr));
    const body = await leseBody(req);
    const modus = leseModus(body.modus);
    const halbjahr = leseHalbjahr(body.halbjahr);
    const kuerzel = leseKuerzel(body.kategorien);
    const planer = istDienstPlaner(s.rolle);
    if (modus === "aenderungen" && !planer) throw new DpFehler(403, "Nur Planer und Admin exportieren Änderungen");
    const termine = (await ladeExportTermine(tx, plan, s.organisationId))
      .filter((t) => imHalbjahr(t.startDatum, halbjahr) && (!kuerzel || kuerzel.includes(t.kategorieKuerzel)));
    let auswahl: ExportTermin[] = termine;
    let loeschen: unknown[] = [];
    let wirksam: "komplett" | "aenderungen" = "komplett";
    let vorherigerLauf: string | null = null;
    if (planer) {
      const vorher = await letzterLauf(tx, plan.id, "ics", null);
      const zeile = (t: ExportTermin) => JSON.stringify([t.startDatum, t.startZeit, t.endeDatum, t.endeZeit, t.titel, t.beschreibung, t.ort, t.ausgefallen]);
      const e = aenderungsExport(termine, zeile, vorher?.stand ?? null, modus, (d) => imHalbjahr(d, halbjahr) );
      wirksam = modus === "aenderungen" && vorher ? "aenderungen" : "komplett";
      auswahl = e.exportieren;
      loeschen = e.loeschen.filter((l) => l.grund === "entfallen");
      vorherigerLauf = vorher?.erstelltAm ?? null;
      await protokolliere(tx, plan.id, "ics", null, wirksam, e.stand, s.kameradId);
    }
    const jetzt = new Date().toISOString();
    const text = icalKalender(auswahl, { name: `Dienstplan ${plan.jahr}${halbjahr ? ` – ${halbjahr}. Halbjahr` : ""}`, beschreibung: standText(jetzt), jetzt });
    const heute = jetzt.slice(0, 10).replace(/-/g, "");
    const dateiname = `dienstplan-${plan.jahr}${halbjahr ? `-h${halbjahr}` : ""}${wirksam === "aenderungen" ? "-aenderungen" : ""}-${heute}.ics`;
    return NextResponse.json(dateiAntwort(dateiname, "text/calendar; charset=utf-8", new TextEncoder().encode(text), {
      anzahl: auswahl.length, loeschen, modus: wirksam, vorherigerLauf, entwurf: plan.status !== "freigegeben",
    }));
  });
}
