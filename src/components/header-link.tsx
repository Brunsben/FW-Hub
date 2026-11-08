"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Aktiv ist ein Link, wenn der Pfad gleich ist oder darunter liegt; "/" nur bei
// exaktem Treffer. Gemeinsam genutzt von Kopfzeile und Handy-Menü.
export function istAktiv(pathname: string, href: string, exakt = false) {
  return exakt
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

// Link der Kopfzeile mit Markierung der aktuellen Seite. Der aktive Zustand
// kommt aus dem Pfad (nicht aus einer Prop), weil die Kopfzeile im gemeinsamen
// Seitenrahmen (app/(portal)/layout.tsx) steht und die Seiten sie nicht kennen.
export function HeaderLink({
  href,
  exakt = false,
  children,
}: {
  href: string;
  exakt?: boolean;
  children: React.ReactNode;
}) {
  const aktiv = istAktiv(usePathname(), href, exakt);

  return (
    <Link
      href={href}
      aria-current={aktiv ? "page" : undefined}
      className={cn(
        "inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
        aktiv && "bg-accent text-accent-foreground",
      )}
    >
      {children}
    </Link>
  );
}
