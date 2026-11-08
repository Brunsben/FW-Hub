import { redirect } from "next/navigation";
import { MitgliederListe } from "@/components/mitglieder/mitglieder-liste";
import { getAuthUser } from "@/lib/auth";
import { listeMitglieder } from "@/lib/mitglieder/lesen";
import { istGlobalAdmin, kannMitgliederSehen } from "@/lib/mitglieder/rechte";
import { redirectNoModuleAccess } from "@/lib/module-guard";
import { APP_ROLES } from "@/lib/rollen";

export const dynamic = "force-dynamic";

// Zentrale Mitgliederverwaltung: Liste mit Suche und Filter. Sehen darf jede
// Verwaltungsrolle (globaler Admin, PSA Admin/Kleiderwart, Küchen-Admin, Funk
// Admin/Gerätewart). Anlegen, Zugang und Aktionen gibt es nur für globale Admins.
// Welche Felder jede Rolle bekommt, bestimmt lib/mitglieder/lesen.ts; der Zugriff
// selbst wird in der Datenbank erzwungen (RLS), nicht hier.
export default async function MitgliederPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  if (!kannMitgliederSehen(user)) return redirectNoModuleAccess("mitglieder");

  const liste = await listeMitglieder(user);
  const admin = istGlobalAdmin(user);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Mitglieder</h1>
        <p className="text-sm text-muted-foreground">
          {admin
            ? "Personen, Zugänge und Rollen an einer Stelle."
            : "Personen und ihre Stammdaten. Änderungen nimmt die Administration vor."}
        </p>
      </div>
      <MitgliederListe
        mitglieder={liste.map((m) => ({
          id: m.id,
          vorname: m.vorname,
          name: m.name,
          dienstgrad: m.dienstgrad,
          personalnummer: m.personalnummer,
          aktiv: m.aktiv,
          zugang: m.zugang,
        }))}
        istAdmin={admin}
        eigeneId={user.kamerad_id}
        eigeneBenutzerId={user.benutzer_id}
        appRollen={[...APP_ROLES]}
      />
    </main>
  );
}
