import { StammdatenFormular } from "@/components/mitglieder/stammdaten-formular";
import type { MitgliedAbschnitt } from "@/lib/mitglieder/abschnitte";
import { ladeMitgliedGecacht } from "@/lib/mitglieder/lesen";
import { kannMitgliedSehen, kannStammdatenBearbeiten } from "@/lib/mitglieder/rechte";

// Stammdaten: sehen alle Verwaltungsrollen und die Person selbst, ändern nur der
// globale Admin (Anlegen, Bearbeiten, Deaktivieren). Erzwungen wird das durch
// RLS (kameraden_anlegen/aendern), Spaltenrechte und den Trigger.
export const stammdatenAbschnitt: MitgliedAbschnitt = {
  key: "stammdaten",
  titel: "Stammdaten",
  reihenfolge: 10,
  rechte: (user, id) => ({
    sehen: kannMitgliedSehen(user, id),
    bearbeiten: kannStammdatenBearbeiten(user),
  }),
  async Komponente({ mitgliedId, bearbeiten, user }) {
    const m = await ladeMitgliedGecacht(user, mitgliedId);
    if (!m) return null;
    return (
      <StammdatenFormular
        mitglied={{
          id: m.id,
          vorname: m.vorname,
          name: m.name,
          dienstgrad: m.dienstgrad,
          email: m.email,
          personalnummer: m.personalnummer,
          aktiv: m.aktiv,
        }}
        bearbeiten={bearbeiten}
        eigene={user.kamerad_id === mitgliedId}
      />
    );
  },
};
