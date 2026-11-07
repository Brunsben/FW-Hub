import Link from "next/link";
import { redirectNoModuleAccess } from "@/lib/module-guard";
import { requirePsaSession } from "@/lib/psa-auth";
import { HashScroll } from "@/components/psa/hash-scroll";
import { AppHeader } from "@/components/app-header";

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
      <AppHeader aktiv="psa" />
      {/* PSA-Unternavigation; Abmelden/Profil liegen in der gemeinsamen Kopfzeile */}
      <nav className="border-b bg-card" aria-label="PSA">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 p-3">
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className="rounded-md px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
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
