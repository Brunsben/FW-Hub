"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Link der Kopfzeile mit Markierung der aktuellen Seite. Der aktive Zustand
// kommt aus dem Pfad (nicht aus einer Prop), weil die Kopfzeile im gemeinsamen
// Seitenrahmen (app/(portal)/layout.tsx) steht und die Seiten sie nicht kennen.
// Aktiv ist der Link, wenn der Pfad gleich ist oder darunter liegt; "/" nur
// bei exaktem Treffer.
export function HeaderLink({
  href,
  exakt = false,
  children,
}: {
  href: string;
  exakt?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const aktiv = exakt
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={aktiv ? "page" : undefined}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground",
        aktiv && "bg-accent text-accent-foreground",
      )}
    >
      {children}
    </Link>
  );
}
