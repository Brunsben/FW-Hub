import { RollenFormular } from "@/components/mitglieder/rollen-formular";
import type { MitgliedAbschnitt } from "@/lib/mitglieder/abschnitte";
import { ladeMitgliedGecacht } from "@/lib/mitglieder/lesen";
import { kannRollenSehenUndBearbeiten } from "@/lib/mitglieder/rechte";
import { MODUL_ROLLEN } from "@/lib/rollen";

// Modulrollen (PSA, Küche, Führerschein, Funk): nur globale Admins, sehen und
// ändern. Geschrieben wird ausschließlich über core.set_kamerad_rollen; fw_app
// hat auf diese Spalten kein INSERT/UPDATE.
export const rollenAbschnitt: MitgliedAbschnitt = {
  key: "rollen",
  titel: "Rollen",
  beschreibung: "Rechte in den Modulen",
  reihenfolge: 30,
  rechte: (user) => {
    const darf = kannRollenSehenUndBearbeiten(user);
    return { sehen: darf, bearbeiten: darf };
  },
  async Komponente({ mitgliedId, user }) {
    const m = await ladeMitgliedGecacht(user, mitgliedId);
    if (!m?.rollen) return null;
    return (
      <RollenFormular
        kameradId={m.id}
        rollen={{
          psaRolle: m.rollen.psa,
          foodRolle: m.rollen.food,
          fkRolle: m.rollen.fk,
          funkRolle: m.rollen.funk,
        }}
        erlaubt={{
          psaRolle: [...MODUL_ROLLEN.psaRolle],
          foodRolle: [...MODUL_ROLLEN.foodRolle],
          fkRolle: [...MODUL_ROLLEN.fkRolle],
          funkRolle: [...MODUL_ROLLEN.funkRolle],
        }}
      />
    );
  },
};
