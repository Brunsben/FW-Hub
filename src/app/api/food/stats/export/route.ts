import { NextResponse } from "next/server";
import { asc, desc, eq, gte } from "drizzle-orm";
import { foodMenus, foodRegistrations, kameraden } from "@/lib/db/schema";
import { withFoodScope } from "@/lib/db/scoped";
import { requireFoodSession } from "@/lib/food-auth";

// Export: Join mit core.kameraden statt der alten users-Tabelle.
export async function GET() {
  const session = await requireFoodSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }
  if (!session.isAdmin) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 });
  }

  try {
    const since = new Date();
    since.setDate(since.getDate() - 365);
    const sinceStr = since.toISOString().split("T")[0];

    const data = await withFoodScope(
      { kameradId: session.kameradId, foodRolle: session.foodRole },
      (tx) =>
        tx
          .select({
            date: foodRegistrations.date,
            vorname: kameraden.vorname,
            name: kameraden.name,
            personalNumber: kameraden.personalnummer,
            menuChoice: foodRegistrations.menuChoice,
            menuDescription: foodMenus.description,
          })
          .from(foodRegistrations)
          .innerJoin(kameraden, eq(foodRegistrations.kameradId, kameraden.id))
          .leftJoin(foodMenus, eq(foodRegistrations.date, foodMenus.date))
          .where(gte(foodRegistrations.date, sinceStr))
          .orderBy(desc(foodRegistrations.date), asc(kameraden.name)),
    );

    const lines = ["Datum;Name;Personalnummer;Menüwahl;Menübeschreibung"];
    for (const row of data) {
      lines.push(
        `${row.date};${row.vorname} ${row.name};${row.personalNumber ?? ""};Menü ${row.menuChoice};${row.menuDescription || ""}`,
      );
    }

    const csv = lines.join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="essensmeldung_export_${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error("Food stats export error:", error);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
