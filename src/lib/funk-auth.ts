import { getAuthUser } from "@/lib/auth";

export type FunkRole = "Admin" | "Gerätewart" | "Einsatzleiter" | "Mitglied";

const FUNK_ROLES: FunkRole[] = [
  "Admin",
  "Gerätewart",
  "Einsatzleiter",
  "Mitglied",
];

export interface FunkSession {
  kameradId: number;
  kameradName: string;
  funkRole: FunkRole;
  isAdmin: boolean; // Geräteverwaltung: Admin oder Gerätewart
}

// Kein eigener Login: verifiziert das Portal-JWT und liest den funk_rolle-Claim.
// Fehlt funk_rolle (oder ist unbekannt), gibt es keine Funk-Session → Zugriff verweigert.
export async function requireFunkSession(): Promise<FunkSession | null> {
  const user = await getAuthUser();
  if (!user) return null;

  const claim = user.funk_rolle;
  if (!claim || !FUNK_ROLES.includes(claim as FunkRole)) return null;
  const funkRole = claim as FunkRole;

  return {
    kameradId: user.kamerad_id,
    kameradName: user.kamerad_name,
    funkRole,
    isAdmin: funkRole === "Admin" || funkRole === "Gerätewart",
  };
}
