import { NextRequest, NextResponse } from "next/server";
import { desc, gte, sql } from "drizzle-orm";
import { foodGuests, foodMenus, foodRegistrations } from "@/lib/db/schema";
import { withFoodPublicScope } from "@/lib/db/scoped";

// Öffentlich: physischer Küchen-Bildschirm ruft diese aggregierten Zähler
// ohne Session ab (wie im Original). Personenbezug steckt nur im Export.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const days = Math.min(
      Math.max(parseInt(searchParams.get("days") || "7", 10) || 7, 1),
      90,
    );

    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().split("T")[0];

    // reg_counts liest fw_food.registrations (RLS) → öffentlicher Food-Scope.
    const { menuData, regCounts, guestData } = await withFoodPublicScope(
      async (tx) => {
        const menuData = await tx
          .select()
          .from(foodMenus)
          .where(gte(foodMenus.date, sinceStr))
          .orderBy(desc(foodMenus.date));

        const regCounts = await tx
          .select({
            date: foodRegistrations.date,
            menuChoice: foodRegistrations.menuChoice,
            count: sql<number>`count(*)::int`,
          })
          .from(foodRegistrations)
          .where(gte(foodRegistrations.date, sinceStr))
          .groupBy(foodRegistrations.date, foodRegistrations.menuChoice);

        const guestData = await tx
          .select()
          .from(foodGuests)
          .where(gte(foodGuests.date, sinceStr));

        return { menuData, regCounts, guestData };
      },
    );

    const stats = menuData.map((menu) => {
      const dayRegs = regCounts.filter((r) => r.date === menu.date);
      const dayGuests = guestData.filter((g) => g.date === menu.date);
      const menu1Regs = dayRegs.find((r) => r.menuChoice === 1)?.count || 0;
      const menu2Regs = dayRegs.find((r) => r.menuChoice === 2)?.count || 0;
      const menu1Guests = dayGuests.find((g) => g.menuChoice === 1)?.count || 0;
      const menu2Guests = dayGuests.find((g) => g.menuChoice === 2)?.count || 0;

      return {
        date: menu.date,
        description: menu.description,
        zweiMenuesAktiv: menu.zweiMenuesAktiv,
        menu1: menu1Regs,
        menu2: menu2Regs,
        guests_menu1: menu1Guests,
        guests_menu2: menu2Guests,
        total: menu1Regs + menu2Regs + menu1Guests + menu2Guests,
      };
    });

    return NextResponse.json({ days, stats });
  } catch (error) {
    console.error("Food stats error:", error);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
