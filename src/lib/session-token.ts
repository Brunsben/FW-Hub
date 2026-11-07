import type { JwtPayload } from "@/lib/auth";

// Einzige Stelle, an der die JWT-Claims aus Benutzer + Kamerad entstehen
// (Login, Erst-Setup, PIN-Änderung). Rollen-Claims kommen aus core.kameraden,
// benutzer_id/tv aus core.benutzer.
export function buildJwtPayload(
  user: {
    id: number;
    benutzername: string;
    rolle: string;
    kameradId: number;
    tokenVersion: number;
  },
  kamerad: {
    vorname: string;
    name: string;
    email: string | null;
    psaRolle: string | null;
    foodRolle: string | null;
    fkRolle: string | null;
    funkRolle: string | null;
  },
): JwtPayload {
  return {
    sub: user.benutzername,
    app_role: user.rolle,
    benutzer_id: user.id,
    tv: user.tokenVersion,
    kamerad_id: user.kameradId,
    kamerad_name: `${kamerad.vorname} ${kamerad.name}`,
    email: kamerad.email ?? undefined,
    psa_rolle: kamerad.psaRolle,
    food_rolle: kamerad.foodRolle,
    fk_rolle: kamerad.fkRolle,
    funk_rolle: kamerad.funkRolle,
  };
}
