import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  foodMenus,
  foodMobileTokens,
  foodRegistrations,
  kameraden,
} from "@/lib/db/schema";
import { today } from "@/lib/food-utils";
import { MobileRegistration } from "./mobile-registration";

export default async function MobilePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const [row] = await db
    .select({
      kameradId: foodMobileTokens.kameradId,
      vorname: kameraden.vorname,
      name: kameraden.name,
      personalnummer: kameraden.personalnummer,
      aktiv: kameraden.aktiv,
    })
    .from(foodMobileTokens)
    .innerJoin(kameraden, eq(kameraden.id, foodMobileTokens.kameradId))
    .where(eq(foodMobileTokens.token, token))
    .limit(1);

  if (!row || !row.aktiv) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm rounded-2xl border p-8 text-center">
          <h1 className="text-xl font-bold">Ungültiger Link</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Dieser Link ist nicht gültig oder nicht mehr aktiv.
          </p>
        </div>
      </main>
    );
  }

  const dateStr = today();
  const [menu] = await db
    .select()
    .from(foodMenus)
    .where(eq(foodMenus.date, dateStr))
    .limit(1);
  const [registration] = await db
    .select({ menuChoice: foodRegistrations.menuChoice })
    .from(foodRegistrations)
    .where(
      and(
        eq(foodRegistrations.kameradId, row.kameradId),
        eq(foodRegistrations.date, dateStr),
      ),
    )
    .limit(1);

  return (
    <MobileRegistration
      user={{
        name: `${row.vorname} ${row.name}`,
        personalNumber: row.personalnummer,
      }}
      menu={
        menu
          ? {
              description: menu.description,
              zweiMenuesAktiv: menu.zweiMenuesAktiv,
              menu1Name: menu.menu1Name,
              menu2Name: menu.menu2Name,
              registrationDeadline: menu.registrationDeadline,
              deadlineEnabled: menu.deadlineEnabled,
            }
          : null
      }
      initialRegistration={
        registration ? { menuChoice: registration.menuChoice } : null
      }
    />
  );
}
