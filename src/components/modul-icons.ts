import {
  CalendarDays,
  Radio,
  ShieldCheck,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

// Schlüssel der Portal-Module (Kopfzeile, Startseiten-Kacheln, Handy-Menü).
export type PortalModulKey = "psa" | "food" | "funk" | "dienstplan" | "mitglieder";

// Ein Icon je Modul. Server-Komponenten geben nur den Schlüssel weiter, die
// Client-Komponenten (Handy-Menü) lösen das Icon hier selbst auf.
export const MODUL_ICONS: Record<PortalModulKey, LucideIcon> = {
  psa: ShieldCheck, // Schutzausrüstung
  food: UtensilsCrossed, // Küche
  funk: Radio, // Funktechnik
  dienstplan: CalendarDays, // Dienstplan (Jahresplanung, Termine)
  mitglieder: Users, // Mitgliederverwaltung (Personen, Zugänge, Rollen)
};
