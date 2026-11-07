import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";

export type ModulKey = "psa" | "food" | "funk" | "fk";

export const MODUL_LABELS: Record<ModulKey, string> = {
  psa: "PSA-Verwaltung",
  food: "Küche",
  funk: "Funktechnik",
  fk: "Führerscheinkontrolle",
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
