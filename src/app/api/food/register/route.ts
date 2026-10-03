import { NextRequest, NextResponse } from "next/server";
import { withFoodPublicScope } from "@/lib/db/scoped";
import {
  findKameradByCardOrPersonal,
  getMenuForDate,
  isRegistrationOpen,
  today,
  toggleRegistration,
  unregisterForDate,
} from "@/lib/food-utils";

type Result = { status: number; body: Record<string, unknown> };

// RFID-Kiosk + mobile QR-Registrierung: bewusst ohne Session (Identifikation
// über Karten-ID/Personalnummer). Markiert sich über withFoodPublicScope als
// vertrauenswürdiger öffentlicher Zugriff (app.food_public), statt ungescoped
// zu laufen.
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

    const result = await withFoodPublicScope<Result>(async (tx) => {
      const kamerad = await findKameradByCardOrPersonal(
        card_id,
        personal_number,
        tx,
      );
      if (!kamerad) {
        return { status: 404, body: { error: "Benutzer nicht gefunden" } };
      }

      const menu = await getMenuForDate(today(), tx);

      // Zwei-Menü-Modus aktiv und keine Wahl übergeben → Rückfrage.
      if (menu?.zweiMenuesAktiv && !menu_choice) {
        return {
          status: 200,
          body: {
            success: true,
            need_menu_choice: true,
            kamerad_id: kamerad.id,
            menu1: menu.menu1Name,
            menu2: menu.menu2Name,
            user: {
              name: `${kamerad.vorname} ${kamerad.name}`,
              personal_number: kamerad.personalnummer,
            },
          },
        };
      }

      if (menu && !isRegistrationOpen(menu)) {
        return { status: 403, body: { error: "Anmeldefrist abgelaufen" } };
      }

      const reg = await toggleRegistration(kamerad.id, menu_choice || 1, tx);
      return {
        status: 200,
        body: {
          success: true,
          registered: reg.registered,
          user: {
            name: `${kamerad.vorname} ${kamerad.name}`,
            personal_number: kamerad.personalnummer,
          },
        },
      };
    });

    return NextResponse.json(result.body, { status: result.status });
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

    const result = await withFoodPublicScope<Result>(async (tx) => {
      const kamerad = await findKameradByCardOrPersonal(
        card_id,
        personal_number,
        tx,
      );
      if (!kamerad) {
        return { status: 404, body: { error: "Benutzer nicht gefunden" } };
      }

      const removed = await unregisterForDate(kamerad.id, today(), tx);
      if (!removed) {
        return {
          status: 404,
          body: { error: "Keine Anmeldung für heute gefunden" },
        };
      }

      return {
        status: 200,
        body: {
          success: true,
          registered: false,
          user: {
            name: `${kamerad.vorname} ${kamerad.name}`,
            personal_number: kamerad.personalnummer,
          },
        },
      };
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error("Food unregister error:", error);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
