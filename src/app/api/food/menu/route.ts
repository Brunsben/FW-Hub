import { NextRequest, NextResponse } from "next/server";
import { requireFoodSession } from "@/lib/food-auth";
import { logFoodAdmin, saveMenu } from "@/lib/food-utils";

// Menü speichern (Admin). Rollenprüfung über food_rolle, keine users-Abhängigkeit.
export async function POST(req: NextRequest) {
  try {
    const session = await requireFoodSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }
    if (!session.isAdmin) {
      return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 });
    }

    const body = await req.json();
    const {
      date,
      description,
      zwei_menues_aktiv,
      menu1_name,
      menu2_name,
      registration_deadline,
      deadline_enabled,
    } = body;

    if (!date || !description) {
      return NextResponse.json(
        { error: "Datum und Beschreibung erforderlich" },
        { status: 400 },
      );
    }

    await saveMenu(date, {
      description,
      zweiMenuesAktiv: zwei_menues_aktiv,
      menu1Name: menu1_name,
      menu2Name: menu2_name,
      registrationDeadline: registration_deadline,
      deadlineEnabled: deadline_enabled,
    });

    await logFoodAdmin(
      session.kameradName,
      "Menü gespeichert",
      `${date}: ${description}`,
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Food menu error:", error);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
