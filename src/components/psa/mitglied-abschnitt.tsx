import { asc, eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { GroessenFormular } from "@/components/psa/groessen-formular";
import {
  psaAusruestungstuecke,
  psaAusruestungstypen,
  psaKameradDetails,
} from "@/lib/db/schema";
import { withScope } from "@/lib/db/scoped";
import type { MitgliedAbschnitt } from "@/lib/mitglieder/abschnitte";
import { kannPsaAbschnittBearbeiten, kannPsaAbschnittSehen } from "@/lib/mitglieder/rechte";
import { GROESSEN_FELDER, type Groessen } from "@/lib/psa-groessen";
import { datumKurz, today } from "@/lib/zeit";

// PSA-Abschnitt der Mitgliederseite: Größen bearbeiten, ausgegebene Ausrüstung
// lesen. Bearbeiten dürfen PSA-Admin und Kleiderwart; die eigenen Daten sieht jede
// Person mit PSA-Rolle (im Profil, nur lesend). Geschrieben
// wird über /api/psa/groessen/[kameradId], gelesen im PSA-Scope (RLS:
// kamerad_details_priv und ausruestungstuecke_priv).
export const psaAbschnitt: MitgliedAbschnitt = {
  key: "psa",
  titel: "PSA",
  beschreibung: "Größen und ausgegebene Ausrüstung",
  reihenfolge: 100,
  profil: true,
  rechte: (user, id) => ({
    sehen: kannPsaAbschnittSehen(user, id),
    bearbeiten: kannPsaAbschnittBearbeiten(user),
  }),
  async Komponente({ mitgliedId, bearbeiten, user }) {
    const { details, stuecke } = await withScope(
      { kameradId: user.kamerad_id, psaRolle: user.psa_rolle ?? "" },
      async (tx) => {
        const [details] = await tx
          .select()
          .from(psaKameradDetails)
          .where(eq(psaKameradDetails.kameradId, mitgliedId))
          .limit(1);
        const stuecke = await tx
          .select({
            id: psaAusruestungstuecke.id,
            typ: psaAusruestungstypen.bezeichnung,
            seriennummer: psaAusruestungstuecke.seriennummer,
            status: psaAusruestungstuecke.status,
            naechstePruefung: psaAusruestungstuecke.naechstePruefung,
          })
          .from(psaAusruestungstuecke)
          .leftJoin(
            psaAusruestungstypen,
            eq(psaAusruestungstypen.id, psaAusruestungstuecke.ausruestungstypId),
          )
          .where(eq(psaAusruestungstuecke.kameradId, mitgliedId))
          .orderBy(asc(psaAusruestungstypen.bezeichnung), asc(psaAusruestungstuecke.seriennummer));
        return { details, stuecke };
      },
    );

    const groessen = Object.fromEntries(
      GROESSEN_FELDER.map((f) => [f.feld, details?.[f.feld] ?? null]),
    ) as Groessen;
    const heute = today();

    return (
      <div className="grid gap-6">
        <div className="grid gap-3">
          <h3 className="text-sm font-medium">Größen</h3>
          <GroessenFormular kameradId={mitgliedId} groessen={groessen} bearbeiten={bearbeiten} />
        </div>

        <div className="grid gap-3 border-t pt-4">
          <h3 className="text-sm font-medium">Ausgegebene Ausrüstung</h3>
          <Table className="max-md:min-w-0">
            <TableHeader>
              <TableRow>
                <TableHead>Stück</TableHead>
                <TableHead className="hidden md:table-cell">Seriennummer</TableHead>
                <TableHead className="hidden md:table-cell">Status</TableHead>
                <TableHead>Nächste Prüfung</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stuecke.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                    Keine Ausrüstung ausgegeben.
                  </TableCell>
                </TableRow>
              ) : (
                stuecke.map((s) => {
                  const faellig = !!s.naechstePruefung && s.naechstePruefung < heute;
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="break-words whitespace-normal">
                        <span className="font-medium">{s.typ ?? "Unbekannter Typ"}</span>
                        <span className="block text-xs text-muted-foreground md:hidden">
                          {[s.seriennummer, s.status].filter(Boolean).join(" · ")}
                        </span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{s.seriennummer ?? "–"}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        {s.status ? <Badge variant="secondary">{s.status}</Badge> : "–"}
                      </TableCell>
                      <TableCell className={faellig ? "font-medium text-destructive" : undefined}>
                        {datumKurz(s.naechstePruefung)}
                        {faellig && <span className="ml-1 text-xs">(fällig)</span>}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  },
};
