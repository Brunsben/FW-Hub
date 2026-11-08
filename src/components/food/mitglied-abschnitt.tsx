import { KarteFormular } from "@/components/food/karte-formular";
import type { MitgliedAbschnitt } from "@/lib/mitglieder/abschnitte";
import { ladeMitgliedGecacht } from "@/lib/mitglieder/lesen";
import { kannKartenIdSehen } from "@/lib/mitglieder/rechte";

// Küche-Abschnitt der Mitgliederseite: Karten-ID (Scan per HID-Eingabefeld) und
// QR-Link zur mobilen Anmeldung. Sehen und bearbeiten nur Küchen-Admins. Die
// Karten-ID kommt nur für sie aus der Projektion (lib/mitglieder/lesen.ts) und
// wird ausschließlich über core.set_karten_id geschrieben.
export const foodAbschnitt: MitgliedAbschnitt = {
  key: "food",
  titel: "Küche",
  beschreibung: "Karten-ID und mobile Anmeldung",
  reihenfolge: 110,
  rechte: (user) => {
    const darf = kannKartenIdSehen(user);
    return { sehen: darf, bearbeiten: darf };
  },
  async Komponente({ mitgliedId, user }) {
    const m = await ladeMitgliedGecacht(user, mitgliedId);
    if (!m) return null;
    return (
      <KarteFormular
        kameradId={m.id}
        kameradName={`${m.vorname} ${m.name}`}
        kartenId={m.kartenId ?? null}
      />
    );
  },
};
