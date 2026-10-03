import { getAuthUser } from "@/lib/auth";

export type FoodRole = "Admin" | "Mitglied";

const FOOD_ROLES: FoodRole[] = ["Admin", "Mitglied"];

export interface FoodSession {
  kameradId: number;
  kameradName: string;
  foodRole: FoodRole;
  isAdmin: boolean; // Menü-/Verwaltungszugriff
}

// Kein eigener Login: verifiziert das Portal-JWT und liest den food_rolle-Claim.
// Fehlt food_rolle (oder ist unbekannt), gibt es keine Food-Session → Zugriff verweigert.
export async function requireFoodSession(): Promise<FoodSession | null> {
  const user = await getAuthUser();
  if (!user) return null;

  const claim = user.food_rolle;
  if (!claim || !FOOD_ROLES.includes(claim as FoodRole)) return null;
  const foodRole = claim as FoodRole;

  return {
    kameradId: user.kamerad_id,
    kameradName: user.kamerad_name,
    foodRole,
    isAdmin: foodRole === "Admin",
  };
}
