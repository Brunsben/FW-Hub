import { NextResponse } from "next/server";
import {
  getGuestsForDate,
  getMenuForDate,
  getRegistrationCount,
  today,
} from "@/lib/food-utils";

// Öffentliche Statusanzeige (unverändert aus dem Original, keine Session).
export async function GET() {
  try {
    const dateStr = today();
    const menu = await getMenuForDate(dateStr);
    const regCount = await getRegistrationCount(dateStr);
    const guestData = await getGuestsForDate(dateStr);
    const guestTotal = guestData.menu1 + guestData.menu2;

    return NextResponse.json({
      date: dateStr,
      menu: menu?.description || null,
      registrations: regCount,
      guests: guestTotal,
      total: regCount + guestTotal,
    });
  } catch (error) {
    console.error("Food status error:", error);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
