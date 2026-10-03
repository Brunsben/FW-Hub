import { NextRequest, NextResponse } from "next/server";
import { requireFoodSession } from "@/lib/food-auth";
import { getGuestsForDate, logFoodAdmin, setGuestCount } from "@/lib/food-utils";

async function requireAdmin() {
  const session = await requireFoodSession();
  if (!session) return { error: "Nicht autorisiert", status: 401 as const };
  if (!session.isAdmin)
    return { error: "Nicht berechtigt", status: 403 as const };
  return { session };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const date = req.nextUrl.searchParams.get("date");
  if (!date) {
    return NextResponse.json({ error: "date erforderlich" }, { status: 400 });
  }

  const guests = await getGuestsForDate(date);
  return NextResponse.json({ date, guests });
}

// Gästezahl setzen (Upsert). POST und PUT verhalten sich identisch.
async function upsertGuests(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();
  const { date, menu_choice, count } = body;

  if (!date || menu_choice === undefined || count === undefined) {
    return NextResponse.json(
      { error: "date, menu_choice und count erforderlich" },
      { status: 400 },
    );
  }

  await setGuestCount(date, Number(menu_choice), Number(count));
  await logFoodAdmin(
    auth.session.kameradName,
    "Gäste aktualisiert",
    `${date}: Menü ${menu_choice} = ${count}`,
  );

  return NextResponse.json({ success: true });
}

export const POST = upsertGuests;
export const PUT = upsertGuests;
