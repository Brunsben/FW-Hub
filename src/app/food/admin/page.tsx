import { redirect } from "next/navigation";
import { asc, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { foodMenus, foodPresetMenus, kameraden } from "@/lib/db/schema";
import { requireFoodSession } from "@/lib/food-auth";
import { today } from "@/lib/food-utils";
import { MenuManager, type MenuRow } from "@/components/food/menu-manager";
import { GuestsManager } from "@/components/food/guests-manager";
import {
  PresetManager,
  type PresetRow,
} from "@/components/food/preset-manager";
import {
  KameradenCardsManager,
  type KameradCardRow,
} from "@/components/food/kameraden-cards-manager";
import { StatsView } from "@/components/food/stats-view";

export default async function FoodAdminPage() {
  const session = await requireFoodSession();
  if (!session) redirect("/login");
  if (!session.isAdmin) redirect("/food");

  const todayStr = today();

  const menus: MenuRow[] = await db
    .select({
      date: foodMenus.date,
      description: foodMenus.description,
      zweiMenuesAktiv: foodMenus.zweiMenuesAktiv,
      menu1Name: foodMenus.menu1Name,
      menu2Name: foodMenus.menu2Name,
      registrationDeadline: foodMenus.registrationDeadline,
      deadlineEnabled: foodMenus.deadlineEnabled,
    })
    .from(foodMenus)
    .where(gte(foodMenus.date, todayStr))
    .orderBy(asc(foodMenus.date));

  const presets: PresetRow[] = await db
    .select({
      id: foodPresetMenus.id,
      name: foodPresetMenus.name,
      sortOrder: foodPresetMenus.sortOrder,
    })
    .from(foodPresetMenus)
    .orderBy(asc(foodPresetMenus.sortOrder), asc(foodPresetMenus.name));

  const kameradenList: KameradCardRow[] = await db
    .select({
      id: kameraden.id,
      vorname: kameraden.vorname,
      name: kameraden.name,
      personalnummer: kameraden.personalnummer,
      kartenId: kameraden.kartenId,
      aktiv: kameraden.aktiv,
    })
    .from(kameraden)
    .orderBy(asc(kameraden.name), asc(kameraden.vorname));

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">FoodBot – Verwaltung</h1>
        <p className="text-sm text-muted-foreground">
          Angemeldet als {session.kameradName} ({session.foodRole})
        </p>
      </div>

      <MenuManager
        menus={menus}
        presets={presets.map((p) => ({ id: p.id, name: p.name }))}
        today={todayStr}
      />
      <GuestsManager today={todayStr} />
      <PresetManager presets={presets} />
      <KameradenCardsManager kameraden={kameradenList} />
      <StatsView />
    </main>
  );
}
