import { PSA_ROLES } from "@/lib/psa-auth";
import { FOOD_ROLES } from "@/lib/food-auth";
import { FUNK_ROLES } from "@/lib/funk-auth";

// Erlaubte Werte je Rollenspalte. Quelle sind die Modul-Auth-Dateien, damit
// Admin-API und Modul-Prüfung nie auseinanderlaufen.
// fk: vorläufig, bis die FK-Business-Logik migriert ist.
export const FK_ROLES = ["Admin", "Prüfer", "Mitglied"] as const;

// App-Rolle (core.benutzer.rolle → JWT-Claim app_role).
export const APP_ROLES = ["Admin", "User"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const MODUL_ROLLEN = {
  psaRolle: PSA_ROLES as readonly string[],
  foodRolle: FOOD_ROLES as readonly string[],
  fkRolle: FK_ROLES as readonly string[],
  funkRolle: FUNK_ROLES as readonly string[],
} as const;

export type RollenSpalte = keyof typeof MODUL_ROLLEN;
export const ROLLEN_SPALTEN = Object.keys(MODUL_ROLLEN) as RollenSpalte[];
