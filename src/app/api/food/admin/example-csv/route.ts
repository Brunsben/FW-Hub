import { NextResponse } from "next/server";
import { requireFoodSession } from "@/lib/food-auth";

// Import-Vorlage: KartenID bleibt, portal_member_id entfällt.
export async function GET() {
  const session = await requireFoodSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }
  if (!session.isAdmin) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 });
  }

  const csv =
    "Name,Personalnummer,KartenID\n" +
    "Max Mustermann,12345,ABC123\n" +
    "Erika Musterfrau,12346,DEF456\n";

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="beispiel_import.csv"',
    },
  });
}
