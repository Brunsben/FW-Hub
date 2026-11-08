import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MitgliedAbschnitt } from "@/lib/mitglieder/abschnitte";
import { ladeVerlauf } from "@/lib/mitglieder/lesen";
import { kannZugangSehenUndBearbeiten } from "@/lib/mitglieder/rechte";
import { datumZeit } from "@/lib/zeit";

const ABSCHNITT_LABEL: Record<string, string> = {
  stammdaten: "Stammdaten",
  zugang: "Zugang",
  rollen: "Rollen",
};

const feldLabel = (feld: string) =>
  ({
    vorname: "Vorname",
    name: "Nachname",
    dienstgrad: "Dienstgrad",
    email: "E-Mail",
    personalnummer: "Personalnummer",
    karten_id: "Karten-ID",
    aktiv: "Status",
    psa_rolle: "PSA-Rolle",
    food_rolle: "Küche-Rolle",
    fk_rolle: "Führerschein-Rolle",
    funk_rolle: "Funk-Rolle",
    benutzername: "Benutzername",
    rolle: "App-Rolle",
    pin: "PIN",
    angelegt: "Angelegt",
    "login angelegt": "Login angelegt",
  })[feld] ?? feld;

// "true"/"false" des Status lesbar machen, sonst Wert unverändert.
const wert = (feld: string, v: string | null) => {
  if (v === null) return "–";
  if (feld === "aktiv") return v === "true" ? "aktiv" : "inaktiv";
  return v;
};

// Änderungsprotokoll (core.mitglieder_audit): nur globale Admins. Die Daten
// schreiben Trigger, PINs stehen nie darin.
export const verlaufAbschnitt: MitgliedAbschnitt = {
  key: "verlauf",
  titel: "Änderungsverlauf",
  beschreibung: "Wer hat wann was geändert (ohne PINs)",
  reihenfolge: 900,
  rechte: (user) => ({ sehen: kannZugangSehenUndBearbeiten(user), bearbeiten: false }),
  async Komponente({ mitgliedId, user }) {
    const eintraege = await ladeVerlauf(user, mitgliedId, 50);
    return (
      <Table className="max-md:min-w-0">
        <TableHeader>
          <TableRow>
            <TableHead>Zeitpunkt</TableHead>
            <TableHead className="hidden md:table-cell">Wer</TableHead>
            <TableHead className="hidden md:table-cell">Bereich</TableHead>
            <TableHead>Änderung</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {eintraege.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                Noch keine Änderungen protokolliert.
              </TableCell>
            </TableRow>
          ) : (
            eintraege.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {datumZeit(e.zeitpunkt)}
                  {/* Handy: Wer und Bereich unter dem Zeitpunkt, damit die Änderung sichtbar bleibt */}
                  <span className="block max-w-[9rem] truncate text-xs md:hidden">
                    {e.akteurName ?? "System"} · {ABSCHNITT_LABEL[e.abschnitt] ?? e.abschnitt}
                  </span>
                </TableCell>
                <TableCell className="hidden md:table-cell">{e.akteurName ?? <span className="text-muted-foreground">System</span>}</TableCell>
                <TableCell className="hidden md:table-cell"><Badge variant="outline">{ABSCHNITT_LABEL[e.abschnitt] ?? e.abschnitt}</Badge></TableCell>
                <TableCell className="break-words whitespace-normal">
                  <span className="font-medium">{feldLabel(e.feld)}</span>
                  {e.alt === null && e.neu === null ? null : (
                    <span className="text-muted-foreground">
                      {": "}
                      {e.alt === null ? "" : `${wert(e.feld, e.alt)} → `}
                      {wert(e.feld, e.neu)}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    );
  },
};
