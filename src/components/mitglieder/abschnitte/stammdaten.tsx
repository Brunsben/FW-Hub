import { StammdatenFormular } from "@/components/mitglieder/stammdaten-formular";
import type { MitgliedAbschnitt } from "@/lib/mitglieder/abschnitte";
import { anzeigenameDetail } from "@/lib/mitglieder/anzeigename";
import { ladeMitgliedGecacht, listeMitglieder } from "@/lib/mitglieder/lesen";
import {
  kannMitgliederSehen,
  kannMitgliedSehen,
  kannStammdatenBearbeiten,
} from "@/lib/mitglieder/rechte";

// Stammdaten: sehen alle Verwaltungsrollen und die Person selbst, ändern nur der
// globale Admin (Anlegen, Bearbeiten, Deaktivieren). Erzwungen wird das durch
// RLS (kameraden_anlegen/aendern), Spaltenrechte und den Trigger.
// Den Anzeigenamen gibt es nur für Verwaltungsrollen: Er vergleicht mit allen
// aktiven Kameraden, und nur diese Rollen sehen alle (im Profil fehlt er).
export const stammdatenAbschnitt: MitgliedAbschnitt = {
  key: "stammdaten",
  titel: "Stammdaten",
  reihenfolge: 10,
  profil: true,
  rechte: (user, id) => ({
    sehen: kannMitgliedSehen(user, id),
    bearbeiten: kannStammdatenBearbeiten(user),
  }),
  async Komponente({ mitgliedId, bearbeiten, user }) {
    const m = await ladeMitgliedGecacht(user, mitgliedId);
    if (!m) return null;
    const anzeigename = kannMitgliederSehen(user)
      ? anzeigenameDetail(m, await listeMitglieder(user))
      : undefined;
    return (
      <StammdatenFormular
        mitglied={{
          id: m.id,
          vorname: m.vorname,
          name: m.name,
          dienstgrad: m.dienstgrad,
          email: m.email,
          personalnummer: m.personalnummer,
          spitzname: m.spitzname,
          spitznameAnzeigen: m.spitznameAnzeigen,
          aktiv: m.aktiv,
        }}
        bearbeiten={bearbeiten}
        eigene={user.kamerad_id === mitgliedId}
        anzeigename={anzeigename}
      />
    );
  },
};
