import { AppHeader } from "@/components/app-header";

// Gemeinsamer Seitenrahmen aller Portalseiten (/, /psa, /funk, /food/admin,
// /admin, /profil): Die Kopfzeile steht per Konstruktion immer oben, eine neue
// Portalseite muss sie nicht mehr selbst einbinden. Bewusst AUSSERHALB dieser
// Route-Group: Kiosk (/food), Mobile-Anmeldung (/food/m/[token]), /login,
// /setup und /api.
export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <div className="flex-1">{children}</div>
    </div>
  );
}
