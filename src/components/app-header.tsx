import Link from "next/link";
import { Flame } from "lucide-react";
import { getAuthUser, isGlobalAdmin, type JwtPayload } from "@/lib/auth";
import { HeaderLink } from "@/components/header-link";
import { HeaderMobileMenu } from "@/components/header-mobile-menu";
import { LogoutButton } from "@/components/logout-button";
import type { PortalModulKey } from "@/components/modul-icons";
import { ThemeToggle } from "@/components/theme-toggle";

export interface ModulLink {
  key: PortalModulKey;
  href: string;
  label: string;
  beschreibung: string;
}

// Module, die ein Benutzer laut seinen Claims öffnen darf. Gemeinsame Quelle
// für Kopfzeile, Handy-Menü und Startseiten-Kacheln.
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

// Gemeinsame Kopfzeile. Ab md: Modulnavigation, Name, Profil, Farbschema,
// Abmelden in einer Zeile. Darunter (Handy, z. B. 375 px) klappt alles in ein
// Menü zusammen (HeaderMobileMenu). Wird ausschließlich vom Seitenrahmen
// app/(portal)/layout.tsx eingebunden und steht damit auf jeder Portalseite
// als Erstes (sticky, halbtransparent mit Blur und feiner unterer Linie).
export async function AppHeader() {
  const user = await getAuthUser();
  if (!user) return null; // Seiten sind selbst geschützt

  const module = sichtbareModule(user);

  return (
    <header
      data-app-header
      className="sticky top-0 z-40 border-b border-border/60 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/70"
    >
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4 sm:px-6">
        <Link
          href="/"
          className="mr-2 inline-flex items-center gap-2 rounded-md text-base font-semibold tracking-tight"
        >
          <Flame className="size-5 text-primary" aria-hidden />
          FW-Hub
        </Link>

        <nav
          className="hidden items-center gap-1 md:flex"
          aria-label="Module"
        >
          <HeaderLink href="/" exakt>
            Start
          </HeaderLink>
          {module.map((m) => (
            <HeaderLink key={m.key} href={m.href}>
              {m.label}
            </HeaderLink>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-2 md:flex">
          <span className="max-w-40 truncate text-sm text-muted-foreground">
            {user.kamerad_name}
          </span>
          <HeaderLink href="/profil">Profil</HeaderLink>
          <ThemeToggle />
          <LogoutButton />
        </div>

        <div className="ml-auto md:hidden">
          <HeaderMobileMenu
            module={module.map(({ key, href, label }) => ({ key, href, label }))}
            name={user.kamerad_name}
          />
        </div>
      </div>
    </header>
  );
}
