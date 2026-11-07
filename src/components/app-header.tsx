import Link from "next/link";
import { getAuthUser, isGlobalAdmin, type JwtPayload } from "@/lib/auth";
import { LogoutButton } from "@/components/logout-button";

export type NavKey = "start" | "psa" | "food" | "funk" | "admin" | "profil";

export interface ModulLink {
  key: Exclude<NavKey, "start" | "profil">;
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

// Gemeinsame Kopfzeile: Modulnavigation, Name, Profil, Abmelden.
// Eingebunden in /, /psa, /funk, /food/admin, /admin/benutzer, /profil.
export async function AppHeader({ aktiv }: { aktiv?: NavKey }) {
  const user = await getAuthUser();
  if (!user) return null; // Seiten sind selbst geschützt

  const linkClass = (key: NavKey) =>
    `rounded-md px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground ${
      aktiv === key ? "bg-accent text-accent-foreground" : ""
    }`;

  return (
    <header data-app-header className="border-b bg-background">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 p-3">
        <Link href="/" className="mr-2 text-base font-bold">
          FW-Hub
        </Link>
        <nav className="flex flex-wrap items-center gap-1" aria-label="Module">
          <Link href="/" className={linkClass("start")}>
            Start
          </Link>
          {sichtbareModule(user).map((m) => (
            <Link key={m.key} href={m.href} className={linkClass(m.key)}>
              {m.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{user.kamerad_name}</span>
          <Link href="/profil" className={linkClass("profil")}>
            Profil
          </Link>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
