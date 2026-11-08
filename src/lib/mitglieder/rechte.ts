// Rechte rund um die zentrale Mitgliederverwaltung (/mitglieder).
//
// Reine Funktionen ohne Abhängigkeiten, damit sie sich direkt testen lassen
// (scripts/test-mitglieder-rechte.mjs). Diese Datei sagt, was die OBERFLÄCHE
// anzeigt und was die API-Routen vorab prüfen. Durchgesetzt wird es in der
// Datenbank (RLS, Spaltenrechte, Funktionen). Die Sichtbarkeit hier ist nur
// Komfort: Wer etwas nicht sehen darf, bekommt es gar nicht erst angeboten.
//
// Wer was darf (Stand Plan Mitgliederverwaltung):
//   Stammdaten sehen    app Admin, PSA Admin/Kleiderwart, Küche Admin,
//                       Funk Admin/Gerätewart, jede Person ihre eigenen
//   Stammdaten ändern   nur app Admin (Kameraden anlegen, deaktivieren)
//   Zugang, Rollen      nur app Admin (sehen und ändern)
//   PSA, Küche, Funk    liefert jedes Modul selbst über die Registry

export interface RechteUser {
  kamerad_id: number;
  app_role: string;
  psa_rolle?: string | null;
  food_rolle?: string | null;
  funk_rolle?: string | null;
}

export interface AbschnittRechte {
  sehen: boolean;
  bearbeiten: boolean;
}

export const KEIN_RECHT: AbschnittRechte = { sehen: false, bearbeiten: false };

// Entspricht isGlobalAdmin() in lib/auth.ts (dort nicht importierbar, weil diese
// Datei ohne Abhängigkeiten bleiben soll).
export const istGlobalAdmin = (u: RechteUser): boolean => u.app_role === "Admin";

export const istPsaVerwaltung = (u: RechteUser): boolean =>
  u.psa_rolle === "Admin" || u.psa_rolle === "Kleiderwart";

export const istKuechenAdmin = (u: RechteUser): boolean => u.food_rolle === "Admin";

export const istFunkVerwaltung = (u: RechteUser): boolean =>
  u.funk_rolle === "Admin" || u.funk_rolle === "Gerätewart";

/** Darf die Mitgliederliste und fremde Mitglieder öffnen (jede Verwaltungsrolle). */
export function kannMitgliederSehen(u: RechteUser): boolean {
  return (
    istGlobalAdmin(u) ||
    istPsaVerwaltung(u) ||
    istKuechenAdmin(u) ||
    istFunkVerwaltung(u)
  );
}

/** Darf diese Person öffnen: die eigene immer, fremde mit einer Verwaltungsrolle. */
export function kannMitgliedSehen(u: RechteUser, mitgliedId: number): boolean {
  return u.kamerad_id === mitgliedId || kannMitgliederSehen(u);
}

export const kannStammdatenBearbeiten = (u: RechteUser): boolean => istGlobalAdmin(u);
export const kannZugangSehenUndBearbeiten = (u: RechteUser): boolean => istGlobalAdmin(u);
export const kannRollenSehenUndBearbeiten = (u: RechteUser): boolean => istGlobalAdmin(u);

/** Karten-ID (Küche) sehen und ändern: nur Küchen-Admin. */
export const kannKartenIdSehen = (u: RechteUser): boolean => istKuechenAdmin(u);

/**
 * Wohin ein Name in einer Liste verlinkt: auf das eigene Profil, auf die
 * Mitgliederseite (mit Verwaltungsrolle) oder gar nicht (null, dann Klartext).
 */
export function mitgliedLinkZiel(u: RechteUser, mitgliedId: number): string | null {
  if (u.kamerad_id === mitgliedId) return "/profil";
  return kannMitgliederSehen(u) ? `/mitglieder/${mitgliedId}` : null;
}
