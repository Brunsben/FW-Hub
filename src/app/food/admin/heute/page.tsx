import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { withFoodScope } from "@/lib/db/scoped";
import { foodGuests, foodRegistrations, kameraden } from "@/lib/db/schema";
import { requireFoodSession } from "@/lib/food-auth";
import { getMenuForDate, today } from "@/lib/food-utils";
import { redirectNoModuleAccess } from "@/lib/module-guard";
import { AppHeader } from "@/components/app-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Heutige Essensanmeldungen – nur Food-Admin (wie /food/admin).
// Nur lesend, alles in EINER withFoodScope-Transaktion:
//  * fw_food.registrations: RLS registrations_access (food_rolle Admin)
//  * core.kameraden: RLS kameraden_food_admin_read (nur Lesen)
//  * fw_food.menus / guests: ohne RLS, gleiche Transaktion der Konsistenz wegen
// Anmeldezeit: fw_food.registrations speichert keinen Zeitpunkt, daher keine
// Spalte (bewusst ohne Migration).
export default async function FoodAdminHeutePage() {
  const session = await requireFoodSession();
  if (!session) return redirectNoModuleAccess("food");
  if (!session.isAdmin) redirect("/food");

  const datum = today();

  const { menu, anmeldungen, gaeste } = await withFoodScope(
    { kameradId: session.kameradId, foodRolle: session.foodRole },
    async (tx) => {
      const menu = await getMenuForDate(datum, tx);
      const anmeldungen = await tx
        .select({
          id: foodRegistrations.id,
          vorname: kameraden.vorname,
          name: kameraden.name,
          menuChoice: foodRegistrations.menuChoice,
        })
        .from(foodRegistrations)
        .innerJoin(kameraden, eq(kameraden.id, foodRegistrations.kameradId))
        .where(eq(foodRegistrations.date, datum))
        .orderBy(asc(kameraden.name), asc(kameraden.vorname));
      const gaeste = await tx
        .select({ menuChoice: foodGuests.menuChoice, count: foodGuests.count })
        .from(foodGuests)
        .where(eq(foodGuests.date, datum));
      return { menu, anmeldungen, gaeste };
    },
  );

  const zweiMenues = Boolean(menu?.zweiMenuesAktiv);
  const menueName = (wahl: number) =>
    (wahl === 2 ? menu?.menu2Name : menu?.menu1Name) || `Menü ${wahl}`;
  const gast = (wahl: number) =>
    gaeste.filter((g) => g.menuChoice === wahl).reduce((s, g) => s + g.count, 0);
  const angemeldet = (wahl: number) =>
    anmeldungen.filter((a) => a.menuChoice === wahl).length;

  const gaesteGesamt = gaeste.reduce((s, g) => s + g.count, 0);
  const gesamt = anmeldungen.length + gaesteGesamt;
  const datumText = new Date(`${datum}T12:00:00`).toLocaleDateString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <>
      <AppHeader aktiv="food" />
      <main className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">Heutige Anmeldungen</h1>
            <p className="text-sm text-muted-foreground">
              {datumText}
              {menu ? ` · ${menu.description}` : " · kein Menü eingetragen"}
            </p>
          </div>
          <Link
            href="/food/admin"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Zur Küchen-Verwaltung
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Zähler</CardTitle>
          </CardHeader>
          <CardContent>
            <dl
              data-zaehler
              className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4"
            >
              <div>
                <dt className="text-muted-foreground">Angemeldet</dt>
                <dd data-zaehler-angemeldet className="text-xl font-semibold">
                  {anmeldungen.length}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Gäste</dt>
                <dd data-zaehler-gaeste className="text-xl font-semibold">
                  {gaesteGesamt}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Essen gesamt</dt>
                <dd data-zaehler-gesamt className="text-xl font-semibold">
                  {gesamt}
                </dd>
              </div>
              {zweiMenues &&
                [1, 2].map((wahl) => (
                  <div key={wahl}>
                    <dt className="text-muted-foreground">{menueName(wahl)}</dt>
                    <dd
                      data-zaehler-menue={wahl}
                      className="text-xl font-semibold"
                    >
                      {angemeldet(wahl) + gast(wahl)}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        ({angemeldet(wahl)} + {gast(wahl)} Gäste)
                      </span>
                    </dd>
                  </div>
                ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Angemeldete Kameraden</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  {zweiMenues && <TableHead>Menüwahl</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {anmeldungen.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={zweiMenues ? 2 : 1}
                      className="text-center text-muted-foreground"
                    >
                      Heute noch keine Anmeldungen.
                    </TableCell>
                  </TableRow>
                ) : (
                  anmeldungen.map((a) => (
                    <TableRow key={a.id} data-anmeldung={a.id}>
                      <TableCell className="font-medium">
                        {`${a.name}, ${a.vorname}`}
                      </TableCell>
                      {zweiMenues && (
                        <TableCell>
                          <Badge variant="secondary">
                            {menueName(a.menuChoice)}
                          </Badge>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
