import { AppHeader } from "@/components/app-header";

// Gemeinsamer Seitenrahmen aller Portalseiten (/, /psa, /funk, /food/admin,
// /admin, /profil): Die Kopfzeile steht per Konstruktion immer oben, eine neue
// Portalseite muss sie nicht mehr selbst einbinden. Bewusst AUSSERHALB dieser
// Route-Group: Kiosk (/food), Mobile-Anmeldung (/food/m/[token]), /login,
// /setup und /api.
//
// Einheitliche Maße: Jede Seite nutzt als Wurzel
//   <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
// und Überschriften <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">.
export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#inhalt"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Zum Inhalt springen
      </a>
      <AppHeader />
      <div id="inhalt" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </div>
    </div>
  );
}
