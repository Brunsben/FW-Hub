import { eq } from "drizzle-orm";
import { withScope } from "@/lib/db/scoped";
import { benutzer, kameraden } from "@/lib/db/schema";
import { requireSessionPage } from "@/lib/module-guard";
import { ProfilForm } from "@/components/profil/profil-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Profil für jeden eingeloggten Benutzer. Daten über withScope (eigene Zeile:
// benutzer_select/kameraden_lesen erlauben kamerad_id = app.kamerad_id).
// Kein PIN-Hash in der Projektion.
export default async function ProfilPage() {
  const user = await requireSessionPage();

  const profil = await withScope(
    { kameradId: user.kamerad_id, psaRolle: "" },
    async (tx) => {
      const [row] = await tx
        .select({
          benutzername: benutzer.benutzername,
          rolle: benutzer.rolle,
          vorname: kameraden.vorname,
          name: kameraden.name,
          psaRolle: kameraden.psaRolle,
          foodRolle: kameraden.foodRolle,
          fkRolle: kameraden.fkRolle,
          funkRolle: kameraden.funkRolle,
        })
        .from(benutzer)
        .innerJoin(kameraden, eq(kameraden.id, benutzer.kameradId))
        .where(eq(benutzer.id, user.benutzer_id))
        .limit(1);
      return row;
    },
  );

  const rollen = [
    ["PSA", profil?.psaRolle],
    ["Küche", profil?.foodRolle],
    ["FK", profil?.fkRolle],
    ["Funk", profil?.funkRolle],
  ] as const;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Mein Profil</h1>
        <p className="text-sm text-muted-foreground">
          {profil?.vorname} {profil?.name} · Benutzername {profil?.benutzername}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Rollen</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-5">
            <dt className="text-muted-foreground">Global</dt>
            <dd className="sm:col-span-4">{profil?.rolle}</dd>
            {rollen.map(([label, wert]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="sm:col-span-4">{wert ?? "–"}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <ProfilForm />
    </main>
  );
}
