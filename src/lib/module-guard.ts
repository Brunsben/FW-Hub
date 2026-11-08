import { redirect } from "next/navigation";
import { getAuthUser, isGlobalAdmin, type JwtPayload } from "@/lib/auth";

export type ModulKey = "psa" | "food" | "funk" | "fk" | "admin" | "mitglieder";

export const MODUL_LABELS: Record<ModulKey, string> = {
  psa: "PSA-Verwaltung",
  food: "Küche",
  funk: "Funktechnik",
  fk: "Führerscheinkontrolle",
  admin: "Benutzerverwaltung",
  mitglieder: "Mitglieder",
};

export function isModulKey(value: unknown): value is ModulKey {
  return typeof value === "string" && value in MODUL_LABELS;
}

// Für Seiten, deren Modul-Session fehlt: Ohne gültiges JWT geht es zum Login.
// Mit gültigem JWT, aber ohne passende Modulrolle, NICHT zum Login (das wäre
// eine Schleife), sondern zur Startseite mit Hinweis.
export async function redirectNoModuleAccess(modul: ModulKey): Promise<never> {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  redirect(`/?kein_zugriff=${modul}`);
}

// Seiten-Gegenstück zu requireGlobalAdmin() (lib/benutzer-admin.ts, für
// API-Routen): ohne Session → /login, ohne globale Admin-Rolle →
// /?kein_zugriff=admin. Liefert den verifizierten Benutzer (inkl.
// token_version-Prüfung aus getAuthUser) für withGlobalAdminScope.
export async function requireGlobalAdminPage(): Promise<JwtPayload> {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  if (!isGlobalAdmin(user)) redirect("/?kein_zugriff=admin");
  return user;
}

// Für Seiten, die nur eine gültige Session brauchen (z. B. /profil).
export async function requireSessionPage(): Promise<JwtPayload> {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  return user;
}
