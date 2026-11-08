import Link from "next/link";

// Name einer Person als Link auf /mitglieder/[id] (oder /profil für die eigene).
// `ziel` kommt aus mitgliedLinkZiel() (lib/mitglieder/rechte.ts). Ist es null,
// darf der Betrachter die Seite nicht öffnen, und der Name erscheint als
// Klartext. Die Seite lädt den Benutzer einmal und rechnet das Ziel selbst aus,
// damit nicht jeder Link eine eigene Sitzungsprüfung auslöst.
export function MitgliedLink({
  ziel,
  children,
  className,
}: {
  ziel: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  if (!ziel) return <span className={className}>{children}</span>;
  return (
    <Link
      href={ziel}
      className={
        "rounded-sm font-medium underline-offset-4 hover:underline" +
        (className ? ` ${className}` : "")
      }
    >
      {children}
    </Link>
  );
}
