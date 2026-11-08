import Link from "next/link";
import { redirectNoModuleAccess } from "@/lib/module-guard";
import { requirePsaSession } from "@/lib/psa-auth";
import { HashScroll } from "@/components/psa/hash-scroll";

export default async function PsaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requirePsaSession();
  if (!session) return redirectNoModuleAccess("psa");

  const canEdit = session.canEdit;

  // Links nur für Bereiche, die die aktuelle Rolle sehen darf.
  const items = [
    { href: "/psa", label: "Dashboard", show: true },
    { href: "/psa#kameraden", label: "Kameraden", show: canEdit },
    { href: "/psa#ausruestung", label: "Ausrüstung", show: canEdit },
    { href: "/psa/typen", label: "Typen", show: canEdit },
    { href: "/psa/normen", label: "Normen", show: canEdit },
    { href: "/psa/verlauf", label: "Verlauf", show: true },
    { href: "/psa/changelog", label: "Changelog", show: canEdit },
  ].filter((i) => i.show);

  return (
    <div>
      <HashScroll />
      {/* PSA-Unternavigation; Kopfzeile, Profil und Abmelden kommen aus dem
          Seitenrahmen app/(portal)/layout.tsx */}
      <nav className="border-b bg-muted/30" aria-label="PSA">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-1 overflow-x-auto px-4 py-2 sm:px-6">
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className="inline-flex h-9 shrink-0 items-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {i.label}
            </Link>
          ))}
        </div>
      </nav>
      {children}
    </div>
  );
}
