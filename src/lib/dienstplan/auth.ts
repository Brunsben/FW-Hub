import { getAuthUser, type JwtPayload } from "@/lib/auth";

// Rollen im Dienstplan (Spec Abschnitt 6, Werte festgelegt am 11.11.2026).
// Ohne Claim (core.kameraden.dienst_rolle NULL) gilt eine angemeldete Person als
// Mitglied: Der Dienstplan ist für alle sichtbar, die Rolle wird nur für Admin
// und Planer vergeben. Ein unbekannter Wert gilt ebenfalls als Mitglied, nie als
// mehr.
export type DienstRolle = "Admin" | "Planer" | "Mitglied";

export const DIENST_ROLES: DienstRolle[] = ["Admin", "Planer", "Mitglied"];

/** Bis core.organisationen kommt, gibt es genau eine Organisation (Seed 1). */
export const DIENSTPLAN_ORGANISATION_ID = 1;

export function dienstRolleAus(user: Pick<JwtPayload, "dienst_rolle">): DienstRolle {
  const claim = user.dienst_rolle;
  return claim && (DIENST_ROLES as string[]).includes(claim) ? (claim as DienstRolle) : "Mitglied";
}

export const istDienstAdmin = (rolle: DienstRolle) => rolle === "Admin";
export const istDienstPlaner = (rolle: DienstRolle) => rolle === "Admin" || rolle === "Planer";

export interface DienstplanSession {
  user: JwtPayload;
  kameradId: number;
  rolle: DienstRolle;
  organisationId: number;
}

// Kein eigener Login: verifiziertes Portal-JWT (getAuthUser, inkl. Live-Prüfung
// von Benutzer und token_version). Ohne Session → null (Route antwortet 401).
export async function requireDienstplanSession(): Promise<DienstplanSession | null> {
  const user = await getAuthUser();
  if (!user) return null;
  return {
    user,
    kameradId: user.kamerad_id,
    rolle: dienstRolleAus(user),
    organisationId: DIENSTPLAN_ORGANISATION_ID,
  };
}
