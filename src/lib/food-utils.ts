import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import type { ScopedTx } from "@/lib/db/scoped";
import {
  foodAdminLog,
  foodGuests,
  foodMenus,
  foodRegistrations,
  kameraden,
} from "@/lib/db/schema";

// Ausführungs-Kontext: globaler Pool (db) ODER eine gescopte Transaktion (tx).
// So können dieselben Helfer innerhalb eines withFoodPublicScope laufen.
type Executor = typeof db | ScopedTx;

// Heutiges Datum als YYYY-MM-DD.
export function today(): string {
  return new Date().toISOString().split("T")[0];
}

export async function getMenuForDate(date: string, exec: Executor = db) {
  const [menu] = await exec
    .select()
    .from(foodMenus)
    .where(eq(foodMenus.date, date))
    .limit(1);
  return menu || null;
}

export async function getGuestsForDate(date: string) {
  const rows = await db
    .select()
    .from(foodGuests)
    .where(eq(foodGuests.date, date));
  return {
    menu1: rows.find((g) => g.menuChoice === 1)?.count || 0,
    menu2: rows.find((g) => g.menuChoice === 2)?.count || 0,
  };
}

export async function getRegistrationCount(date: string) {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(foodRegistrations)
    .where(eq(foodRegistrations.date, date));
  return result?.count || 0;
}

// Gästezahl für Datum + Menüwahl setzen (Upsert).
export async function setGuestCount(
  date: string,
  menuChoice: number,
  count: number,
) {
  const [existing] = await db
    .select()
    .from(foodGuests)
    .where(and(eq(foodGuests.date, date), eq(foodGuests.menuChoice, menuChoice)))
    .limit(1);

  if (existing) {
    await db
      .update(foodGuests)
      .set({ count: Math.max(0, count) })
      .where(eq(foodGuests.id, existing.id));
  } else if (count > 0) {
    await db
      .insert(foodGuests)
      .values({ date, menuChoice, count: Math.max(0, count) });
  }
}

// Prüft, ob die Anmeldung für ein Menü noch offen ist (Deadline-Check).
export function isRegistrationOpen(menu: {
  registrationDeadline: string;
  deadlineEnabled: boolean;
}) {
  if (!menu.deadlineEnabled) return true;
  const now = new Date();
  const [hours, minutes] = menu.registrationDeadline.split(":").map(Number);
  const deadline = new Date();
  deadline.setHours(hours, minutes, 0, 0);
  return now < deadline;
}

// An-/Abmeldung für heute umschalten. Umgestellt von userId auf kameradId.
export async function toggleRegistration(
  kameradId: number,
  menuChoice: number = 1,
  exec: Executor = db,
) {
  const dateStr = today();

  const [existing] = await exec
    .select()
    .from(foodRegistrations)
    .where(
      and(
        eq(foodRegistrations.kameradId, kameradId),
        eq(foodRegistrations.date, dateStr),
      ),
    )
    .limit(1);

  if (existing) {
    await exec
      .delete(foodRegistrations)
      .where(eq(foodRegistrations.id, existing.id));
    return { registered: false, menuChoice: existing.menuChoice };
  }

  await exec
    .insert(foodRegistrations)
    .values({ kameradId, date: dateStr, menuChoice });
  return { registered: true, menuChoice };
}

// Explizite Abmeldung (für den DELETE-Handler): heutige Registrierung entfernen.
export async function unregisterForDate(
  kameradId: number,
  dateStr = today(),
  exec: Executor = db,
) {
  const removed = await exec
    .delete(foodRegistrations)
    .where(
      and(
        eq(foodRegistrations.kameradId, kameradId),
        eq(foodRegistrations.date, dateStr),
      ),
    )
    .returning({ id: foodRegistrations.id });
  return removed.length > 0;
}

// Kamerad über Karten-ID oder Personalnummer finden (kein portal_member_id mehr).
// Nur aktive Kameraden: Deaktivierte dürfen sich nicht zum Essen anmelden.
export async function findKameradByCardOrPersonal(
  cardId?: string | null,
  personalNumber?: string | null,
  exec: Executor = db,
) {
  if (cardId) {
    const [k] = await exec
      .select()
      .from(kameraden)
      .where(and(eq(kameraden.kartenId, String(cardId)), eq(kameraden.aktiv, true)))
      .limit(1);
    if (k) return k;
  }
  if (personalNumber) {
    const [k] = await exec
      .select()
      .from(kameraden)
      .where(
        and(
          eq(kameraden.personalnummer, String(personalNumber)),
          eq(kameraden.aktiv, true),
        ),
      )
      .limit(1);
    if (k) return k;
  }
  return null;
}

export async function saveMenu(
  date: string,
  data: {
    description: string;
    zweiMenuesAktiv?: boolean;
    menu1Name?: string;
    menu2Name?: string;
    registrationDeadline?: string;
    deadlineEnabled?: boolean;
  },
) {
  const existing = await getMenuForDate(date);

  const values = {
    date,
    description: data.description,
    zweiMenuesAktiv: data.zweiMenuesAktiv || false,
    menu1Name: data.menu1Name || null,
    menu2Name: data.menu2Name || null,
    registrationDeadline: data.registrationDeadline || "19:45",
    deadlineEnabled: data.deadlineEnabled !== false,
  };

  if (existing) {
    await db.update(foodMenus).set(values).where(eq(foodMenus.id, existing.id));
  } else {
    await db.insert(foodMenus).values(values);
  }
}

// Admin-Aktionen protokollieren (fw_food.admin_log). Fehler werden geschluckt.
export async function logFoodAdmin(
  adminUser: string,
  action: string,
  details?: string | null,
) {
  try {
    await db
      .insert(foodAdminLog)
      .values({ adminUser, action, details: details ?? null });
  } catch (e) {
    console.warn("Food-AdminLog fehlgeschlagen:", e);
  }
}
