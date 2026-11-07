import Link from "next/link";
import { getAuthUser, isGlobalAdmin, type JwtPayload } from "@/lib/auth";
import { HeaderLink } from "@/components/header-link";
import { LogoutButton } from "@/components/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";

export interface ModulLink {
  key: "psa" | "food" | "funk" | "admin";
  href: string;
  label: string;
  beschreibung: string;
}

// Module, die ein Benutzer laut seinen Claims öffnen darf. Gemeinsame Quelle
// für Kopfzeile und Startseiten-Kacheln.
// Küche: nur die Verwaltung (/food/admin) ist ein Portal-Modul; sie verlangt
// food_rolle Admin (Mitglieder würden zum Kiosk /food umgeleitet).
// FK hat noch keine Seite und erscheint daher nicht.
export function sichtbareModule(user: JwtPayload): ModulLink[] {
  const module: ModulLink[] = [];
  if (user.psa_rolle) {
    module.push({ key: "psa", href: "/psa", label: "PSA", beschreibung: "Persönliche Schutzausrüstung" });
  }
  if (user.food_rolle === "Admin") {
    module.push({ key: "food", href: "/food/admin", label: "Küche-Verwaltung", beschreibung: "Menüs, Gäste, Karten, Statistik" });
  }
  if (user.funk_rolle) {
    module.push({ key: "funk", href: "/funk", label: "Funktechnik", beschreibung: "Funkgeräte und Zuweisungen" });
  }
  if (isGlobalAdmin(user)) {
    module.push({ key: "admin", href: "/admin/benutzer", label: "Benutzerverwaltung", beschreibung: "Accounts, PINs und Rollen" });
  }
  return module;
}

// Gemeinsame Kopfzeile: Modulnavigation, Name, Profil, Farbschema, Abmelden.
// Wird ausschließlich vom Seitenrahmen app/(portal)/layout.tsx eingebunden und
// steht damit auf jeder Portalseite als Erstes (sticky am oberen Rand).
export async function AppHeader() {
  const user = await getAuthUser();
  if (!user) return null; // Seiten sind selbst geschützt

  return (
    <header
      data-app-header
      className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 p-3">
        <Link href="/" className="mr-2 text-base font-bold">
          FW-Hub
        </Link>
        <nav className="flex flex-wrap items-center gap-1" aria-label="Module">
          <HeaderLink href="/" exakt>
            Start
          </HeaderLink>
          {sichtbareModule(user).map((m) => (
            <HeaderLink key={m.key} href={m.href}>
              {m.label}
            </HeaderLink>
          ))}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">{user.kamerad_name}</span>
          <HeaderLink href="/profil">Profil</HeaderLink>
          <ThemeToggle />
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
