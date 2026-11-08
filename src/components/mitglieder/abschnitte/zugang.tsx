import { ZugangFormular } from "@/components/mitglieder/zugang-formular";
import type { MitgliedAbschnitt } from "@/lib/mitglieder/abschnitte";
import { ladeMitgliedGecacht } from "@/lib/mitglieder/lesen";
import { kannZugangSehenUndBearbeiten } from "@/lib/mitglieder/rechte";
import { APP_ROLES } from "@/lib/rollen";

// Vorschlag für den Benutzernamen: vorname.nachname in Kleinbuchstaben, Umlaute
// aufgelöst, nur a-z und 0-9.
function vorschlag(vorname: string, name: string): string {
  const teil = (s: string) =>
    s
      .toLowerCase()
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]/g, "");
  return [teil(vorname), teil(name)].filter(Boolean).join(".");
}

// Zugang (Login anlegen, PIN zurücksetzen, sperren, App-Rolle): nur globale
// Admins, sehen und ändern. Erzwungen durch benutzer_select/insert/update.
export const zugangAbschnitt: MitgliedAbschnitt = {
  key: "zugang",
  titel: "Zugang",
  beschreibung: "Login, PIN und App-Rolle",
  reihenfolge: 20,
  rechte: (user) => {
    const darf = kannZugangSehenUndBearbeiten(user);
    return { sehen: darf, bearbeiten: darf };
  },
  async Komponente({ mitgliedId, user }) {
    const m = await ladeMitgliedGecacht(user, mitgliedId);
    if (!m) return null;
    return (
      <ZugangFormular
        kameradId={m.id}
        kameradName={`${m.vorname} ${m.name}`}
        kameradAktiv={m.aktiv}
        zugang={m.zugang ?? null}
        eigeneBenutzerId={user.benutzer_id}
        appRollen={[...APP_ROLES]}
        vorschlagBenutzername={vorschlag(m.vorname, m.name)}
      />
    );
  },
};
