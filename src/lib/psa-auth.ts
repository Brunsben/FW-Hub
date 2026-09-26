import { getAuthUser } from "@/lib/auth";

export type PsaRole = "Admin" | "Kleiderwart" | "User";

const PSA_ROLES: PsaRole[] = ["Admin", "Kleiderwart", "User"];

export interface PsaSession {
  kameradId: number;
  kameradName: string;
  psaRole: PsaRole;
  canEdit: boolean; // Admin oder Kleiderwart: Vollzugriff
  isUser: boolean; // reine Leseansicht der eigenen Daten
}

// Kein eigener Login: verifiziert das Portal-JWT und liest den psa_rolle-Claim.
// Fehlt psa_rolle (oder ist unbekannt), gibt es keine PSA-Session → Zugriff verweigert.
export async function requirePsaSession(): Promise<PsaSession | null> {
  const user = await getAuthUser();
  if (!user) return null;

  const claim = user.psa_rolle;
  if (!claim || !PSA_ROLES.includes(claim as PsaRole)) return null;
  const psaRole = claim as PsaRole;

  return {
    kameradId: user.kamerad_id,
    kameradName: user.kamerad_name,
    psaRole,
    canEdit: psaRole === "Admin" || psaRole === "Kleiderwart",
    isUser: psaRole === "User",
  };
}
