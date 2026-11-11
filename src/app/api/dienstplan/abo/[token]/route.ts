import { sql } from "drizzle-orm";
import { withDienstplanAboScope } from "@/lib/db/scoped";
import { hashAboToken } from "@/lib/dienstplan/abo";
import { icalKalender, standText, type ExportTermin } from "@/lib/dienstplan/export";
import { ladeExportTermine } from "@/lib/dienstplan/export-db";

type Ctx = { params: Promise<{ token: string }> };

// iCal-Abo-Feed ohne Login (Spec 9.4): /api/dienstplan/abo/<token>.ics
// Schutz nur über das Token (geprüft in der Datenbank, dienstplan.abo_scope).
// Inhalt: alle freigegebenen Pläne ab dem Vorjahr (Mitglieder-Sicht, ohne
// Notizen). Unbekanntes oder widerrufenes Token → 404 ohne Unterscheidung.
// Antwort ohne Cache bei Cloudflare (private), Kalender holen selbst neu.
export async function GET(_req: Request, { params }: Ctx) {
  const hash = hashAboToken((await params).token);
  const nichtGefunden = () => new Response("Nicht gefunden\n", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  if (!hash) return nichtGefunden();
  const text = await withDienstplanAboScope(hash, async (tx, organisationId) => {
    const ab = new Date().getFullYear() - 1;
    const plaene = [...await tx.execute<{ id: number; jahr: number }>(sql`
      select id, jahr from dienstplan.plaene
       where organisation_id = ${organisationId} and status = 'freigegeben' and jahr >= ${ab} order by jahr`)];
    const termine: ExportTermin[] = [];
    for (const p of plaene) termine.push(...await ladeExportTermine(tx, p, organisationId));
    const jetzt = new Date().toISOString();
    return icalKalender(termine, { name: "Dienstplan", beschreibung: standText(jetzt), jetzt });
  });
  if (text === null) return nichtGefunden();
  return new Response(text, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="dienstplan.ics"',
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex",
    },
  });
}
