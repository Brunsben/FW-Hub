import { NextRequest, NextResponse } from "next/server";
import {
  findKameradByCardOrPersonal,
  getMenuForDate,
  isRegistrationOpen,
  today,
  toggleRegistration,
  unregisterForDate,
} from "@/lib/food-utils";

// RFID-Kiosk + mobile QR-Registrierung: bewusst ohne Session (Identifikation
// über Karten-ID/Personalnummer). Kein portal_member_id-Fallback mehr.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { card_id, personal_number, menu_choice } = body;

    if (!card_id && !personal_number) {
      return NextResponse.json(
        { error: "card_id oder personal_number erforderlich" },
        { status: 400 },
      );
    }

    const kamerad = await findKameradByCardOrPersonal(card_id, personal_number);
    if (!kamerad) {
      return NextResponse.json(
        { error: "Benutzer nicht gefunden" },
        { status: 404 },
      );
    }

    const dateStr = today();
    const menu = await getMenuForDate(dateStr);

    // Zwei-Menü-Modus aktiv und keine Wahl übergeben → Rückfrage.
    if (menu?.zweiMenuesAktiv && !menu_choice) {
      return NextResponse.json({
        success: true,
        need_menu_choice: true,
        kamerad_id: kamerad.id,
        menu1: menu.menu1Name,
        menu2: menu.menu2Name,
        user: {
          name: `${kamerad.vorname} ${kamerad.name}`,
          personal_number: kamerad.personalnummer,
        },
      });
    }

    if (menu && !isRegistrationOpen(menu)) {
      return NextResponse.json(
        { error: "Anmeldefrist abgelaufen" },
        { status: 403 },
      );
    }

    const result = await toggleRegistration(kamerad.id, menu_choice || 1);

    return NextResponse.json({
      success: true,
      registered: result.registered,
      user: {
        name: `${kamerad.vorname} ${kamerad.name}`,
        personal_number: kamerad.personalnummer,
      },
    });
  } catch (error) {
    console.error("Food register error:", error);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}

// Explizite Abmeldung. Im Original fehlte dieser Handler, obwohl die
// Mobile-Registrierung ihn aufruft — hier ergänzt.
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { card_id, personal_number } = body;

    if (!card_id && !personal_number) {
      return NextResponse.json(
        { error: "card_id oder personal_number erforderlich" },
        { status: 400 },
      );
    }

    const kamerad = await findKameradByCardOrPersonal(card_id, personal_number);
    if (!kamerad) {
      return NextResponse.json(
        { error: "Benutzer nicht gefunden" },
        { status: 404 },
      );
    }

    const removed = await unregisterForDate(kamerad.id);
    if (!removed) {
      return NextResponse.json(
        { error: "Keine Anmeldung für heute gefunden" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      registered: false,
      user: {
        name: `${kamerad.vorname} ${kamerad.name}`,
        personal_number: kamerad.personalnummer,
      },
    });
  } catch (error) {
    console.error("Food unregister error:", error);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
