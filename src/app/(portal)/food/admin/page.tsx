import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { redirectNoModuleAccess } from "@/lib/module-guard";
import { foodMenus, foodPresetMenus } from "@/lib/db/schema";
import { requireFoodSession } from "@/lib/food-auth";
import { today } from "@/lib/food-utils";
import { MenuManager, type MenuRow } from "@/components/food/menu-manager";
import { GuestsManager } from "@/components/food/guests-manager";
import {
  PresetManager,
  type PresetRow,
} from "@/components/food/preset-manager";
import { KartenImport } from "@/components/food/karten-import";
import { StatsView } from "@/components/food/stats-view";

export default async function FoodAdminPage() {
  const session = await requireFoodSession();
  if (!session) return redirectNoModuleAccess("food");
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

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">FoodBot – Verwaltung</h1>
          <p className="text-sm text-muted-foreground">
            Angemeldet als {session.kameradName} ({session.foodRole})
          </p>
        </div>
        <Link
          href="/food/admin/heute"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Heutige Anmeldungen
        </Link>
      </div>

      <MenuManager
        menus={menus}
        presets={presets.map((p) => ({ id: p.id, name: p.name }))}
        today={todayStr}
      />
      <GuestsManager today={todayStr} />
      <PresetManager presets={presets} />
      <KartenImport />
      <StatsView />
    </main>
  );
}
