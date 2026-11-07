import { sql } from "drizzle-orm";
import { db } from "./index";

// Transaktions-Objekt-Typ von db.transaction (für die durchgereichte Query-Fn).
export type ScopedTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface DbScope {
  kameradId: number;
  psaRolle: string;
}

// Öffnet eine Transaktion, setzt die RLS-relevanten GUCs transaktionslokal
// und reicht die eigentliche Query-Funktion (mit der Transaktion) durch.
// set_config(..., true) entspricht SET LOCAL, ist aber parametrisierbar —
// die Werte gehen als Bind-Parameter (kein SQL-Injection-Risiko).
export async function withScope<T>(
  scope: DbScope,
  fn: (tx: ScopedTx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.kamerad_id', ${String(scope.kameradId)}, true)`,
    );
    await tx.execute(
      sql`select set_config('app.psa_rolle', ${scope.psaRolle}, true)`,
    );
    return fn(tx);
  });
}

// Scope für die Admin-Routen (/api/admin/*). Die bestehenden Policies auf
// core.benutzer/core.kameraden erlauben fremde Zeilen nur mit
// app.psa_rolle IN ('Admin','Kleiderwart'). Ein globaler Admin (app_role Admin)
// hat nicht zwingend eine psa_rolle — mit seinem eigenen Scope sähe er nur die
// eigene Zeile. Daher setzt dieser Scope für VERIFIZIERTE globale Admins
// app.psa_rolle = 'Admin'. Zusätzlich app.app_rolle = 'Admin' als Vorbereitung
// für die Policy-Verschärfung (drizzle/manual/benutzer-scope-verschaerfung.sql).
// Nur in Admin-Routen nach requireGlobalAdmin() verwenden.
export async function withGlobalAdminScope<T>(
  admin: { kamerad_id: number; app_role: string },
  fn: (tx: ScopedTx) => Promise<T>,
): Promise<T> {
  if (admin.app_role !== "Admin") {
    throw new Error("withGlobalAdminScope: kein globaler Admin");
  }
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.kamerad_id', ${String(admin.kamerad_id)}, true)`,
    );
    await tx.execute(sql`select set_config('app.psa_rolle', 'Admin', true)`);
    await tx.execute(sql`select set_config('app.app_rolle', 'Admin', true)`);
    return fn(tx);
  });
}

export interface FoodScope {
  kameradId: number;
  foodRolle: string;
}

// Food-Admin-Scope: setzt app.food_rolle (+ kamerad_id) für den Admin-Zweig
// der fw_food-Policies.
export async function withFoodScope<T>(
  scope: FoodScope,
  fn: (tx: ScopedTx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.kamerad_id', ${String(scope.kameradId)}, true)`,
    );
    await tx.execute(
      sql`select set_config('app.food_rolle', ${scope.foodRolle}, true)`,
    );
    return fn(tx);
  });
}

export interface FunkScope {
  kameradId: number;
  funkRolle: string;
}

// Funk-Scope: setzt app.funk_rolle (+ kamerad_id). Admin/Gerätewart dürfen
// über die Policy kameraden_funk_read alle core.kameraden lesen, andere Rollen
// nur die eigene Zeile (kameraden_scope).
export async function withFunkScope<T>(
  scope: FunkScope,
  fn: (tx: ScopedTx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.kamerad_id', ${String(scope.kameradId)}, true)`,
    );
    await tx.execute(
      sql`select set_config('app.funk_rolle', ${scope.funkRolle}, true)`,
    );
    return fn(tx);
  });
}

// Bewusst login-freier, aber als vertrauenswürdig markierter öffentlicher
// Food-Zugriff (Kiosk/Mobile): setzt app.food_public='true' statt eines
// personen-/rollenbezogenen Scopes.
export async function withFoodPublicScope<T>(
  fn: (tx: ScopedTx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.food_public', 'true', true)`);
    return fn(tx);
  });
}
