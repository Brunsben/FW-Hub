"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Menu, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { istAktiv } from "@/components/header-link";
import { LogoutButton } from "@/components/logout-button";
import { MODUL_ICONS, type PortalModulKey } from "@/components/modul-icons";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

export interface MobileMenuModul {
  key: PortalModulKey;
  href: string;
  label: string;
}

const itemClass = (aktiv: boolean) =>
  cn(
    "flex h-12 items-center gap-3 rounded-lg px-3 text-base font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
    aktiv ? "bg-accent text-accent-foreground" : "text-foreground",
  );

// Inhalt des Handy-Menüs: alle Modullinks, Profil, Farbschema, Abmelden.
// Getrennt vom Sheet, damit er auch ohne geöffnetes Menü prüfbar ist.
export function MobileMenuInhalt({
  module,
  name,
  pathname,
}: {
  module: MobileMenuModul[];
  name: string;
  pathname: string;
}) {
  return (
    <div className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 pb-6">
      <nav aria-label="Module" className="flex flex-col gap-1">
        <SheetClose asChild>
          <Link
            href="/"
            aria-current={istAktiv(pathname, "/", true) ? "page" : undefined}
            className={itemClass(istAktiv(pathname, "/", true))}
          >
            <House className="size-5 shrink-0" aria-hidden />
            Start
          </Link>
        </SheetClose>
        {module.map((m) => {
          const Icon = MODUL_ICONS[m.key];
          const aktiv = istAktiv(pathname, m.href);
          return (
            <SheetClose asChild key={m.key}>
              <Link
                href={m.href}
                aria-current={aktiv ? "page" : undefined}
                className={itemClass(aktiv)}
              >
                <Icon className="size-5 shrink-0" aria-hidden />
                {m.label}
              </Link>
            </SheetClose>
          );
        })}
      </nav>

      <div className="my-3 border-t" />

      <SheetClose asChild>
        <Link
          href="/profil"
          aria-current={istAktiv(pathname, "/profil") ? "page" : undefined}
          className={itemClass(istAktiv(pathname, "/profil"))}
        >
          <UserRound className="size-5 shrink-0" aria-hidden />
          <span className="flex min-w-0 flex-col leading-tight">
            Profil
            <span className="truncate text-xs font-normal text-muted-foreground">
              {name}
            </span>
          </span>
        </Link>
      </SheetClose>

      <div className="mt-3 flex items-center justify-between gap-3 px-3">
        <span className="text-sm text-muted-foreground">Farbschema</span>
        <ThemeToggle />
      </div>

      <div className="mt-4 px-3">
        <LogoutButton className="h-11 w-full text-base" />
      </div>
    </div>
  );
}

// Handy-Menü der Kopfzeile (unter md): Knopf mit Sheet von rechts. Links
// schließen das Menü über SheetClose.
export function HeaderMobileMenu({
  module,
  name,
}: {
  module: MobileMenuModul[];
  name: string;
}) {
  const [offen, setOffen] = useState(false);
  const pathname = usePathname();

  return (
    <Sheet open={offen} onOpenChange={setOffen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          className="md:hidden"
          aria-label="Menü öffnen"
        >
          <Menu aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[85%] max-w-sm gap-2 p-0">
        <SheetHeader className="p-4 pr-16">
          <SheetTitle>Menü</SheetTitle>
          <SheetDescription className="sr-only">
            Navigation, Profil, Farbschema und Abmelden
          </SheetDescription>
        </SheetHeader>
        <MobileMenuInhalt module={module} name={name} pathname={pathname} />
      </SheetContent>
    </Sheet>
  );
}
