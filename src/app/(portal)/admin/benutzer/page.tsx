import { and, asc, eq, isNull } from "drizzle-orm";
import { withGlobalAdminScope } from "@/lib/db/scoped";
import { benutzer, kameraden } from "@/lib/db/schema";
import { requireGlobalAdminPage } from "@/lib/module-guard";
import { MODUL_ROLLEN, APP_ROLES } from "@/lib/rollen";
import {
  BenutzerManager,
  type BenutzerRow,
  type KameradOption,
} from "@/components/admin/benutzer-manager";

// Benutzerverwaltung — nur globaler Admin. Daten über withGlobalAdminScope
// nach requireGlobalAdminPage() (Seiten-Gegenstück zu requireGlobalAdmin()).
// Der PIN-Hash wird nie selektiert.
export default async function AdminBenutzerPage() {
  const admin = await requireGlobalAdminPage();

  const { rows, freieKameraden } = await withGlobalAdminScope(admin, async (tx) => {
    const rows: BenutzerRow[] = await tx
      .select({
        id: benutzer.id,
        benutzername: benutzer.benutzername,
        rolle: benutzer.rolle,
        aktiv: benutzer.aktiv,
        kameradId: benutzer.kameradId,
        vorname: kameraden.vorname,
        name: kameraden.name,
        kameradAktiv: kameraden.aktiv,
        psaRolle: kameraden.psaRolle,
        foodRolle: kameraden.foodRolle,
        fkRolle: kameraden.fkRolle,
        funkRolle: kameraden.funkRolle,
      })
      .from(benutzer)
      .innerJoin(kameraden, eq(kameraden.id, benutzer.kameradId))
      .orderBy(asc(kameraden.name), asc(kameraden.vorname));

    // Kamerad-Auswahl: nur aktive Kameraden ohne Account.
    const freieKameraden: KameradOption[] = await tx
      .select({ id: kameraden.id, vorname: kameraden.vorname, name: kameraden.name })
      .from(kameraden)
      .leftJoin(benutzer, eq(benutzer.kameradId, kameraden.id))
      .where(and(eq(kameraden.aktiv, true), isNull(benutzer.id)))
      .orderBy(asc(kameraden.name), asc(kameraden.vorname));

    return { rows, freieKameraden };
  });

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Benutzerverwaltung</h1>
        <p className="text-sm text-muted-foreground">
          Angemeldet als {admin.kamerad_name} (globaler Admin)
        </p>
      </div>
      <BenutzerManager
        rows={rows}
        freieKameraden={freieKameraden}
        eigeneBenutzerId={admin.benutzer_id}
        modulRollen={{
          psaRolle: [...MODUL_ROLLEN.psaRolle],
          foodRolle: [...MODUL_ROLLEN.foodRolle],
          fkRolle: [...MODUL_ROLLEN.fkRolle],
          funkRolle: [...MODUL_ROLLEN.funkRolle],
        }}
        appRollen={[...APP_ROLES]}
      />
    </main>
  );
}
