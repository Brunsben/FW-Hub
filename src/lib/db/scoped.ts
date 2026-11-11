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

// Scope für die Admin-Routen (/api/admin/*). Setzt für VERIFIZIERTE globale
// Admins nur app.app_rolle = 'Admin'. Darauf stützen sich die Policies auf
// core.kameraden (kameraden_lesen/anlegen/aendern) und core.benutzer
// (benutzer_select/insert/update/delete) sowie core.set_kamerad_rollen. Es
// setzt KEIN app.psa_rolle: Ein globaler Admin erhält dadurch keinen Zugriff
// auf PSA-Tabellen. Wer PSA-Daten braucht, nimmt withGlobalAdminPsaScope.
// Nur in Admin-Routen nach requireGlobalAdmin() bzw. requireGlobalAdminPage()
// und im Erst-Setup verwenden.
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
    await tx.execute(sql`select set_config('app.app_rolle', 'Admin', true)`);
    return fn(tx);
  });
}

// Wie withGlobalAdminScope, zusätzlich app.psa_rolle = 'Admin'. Einziger Zweck:
// globale Admin-Aktionen auf PSA-Tabellen, die unabhängig von der eigenen
// psa_rolle laufen müssen (Stück-Löschen prüft die Historie über alle
// Benutzer). Gleiche Vorbedingung: vorher requireGlobalAdmin().
export async function withGlobalAdminPsaScope<T>(
  admin: { kamerad_id: number; app_role: string },
  fn: (tx: ScopedTx) => Promise<T>,
): Promise<T> {
  return withGlobalAdminScope(admin, async (tx) => {
    await tx.execute(sql`select set_config('app.psa_rolle', 'Admin', true)`);
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
// nur die eigene Zeile (kameraden_lesen).
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

export interface DienstplanScope {
  kameradId: number;
  /** Admin | Planer | Mitglied (lib/dienstplan/auth.ts, ohne Claim Mitglied). */
  dienstRolle: string;
  organisationId: number;
}

// Dienstplan-Scope: setzt app.kamerad_id, app.dienst_rolle und app.dienst_org.
// Die Policies im Schema dienstplan (Migration 0018) werten genau diese drei
// aus; ohne Scope sieht fw_app dort nichts. core.kameraden liest das Modul nicht
// direkt, sondern über dienstplan.kameraden_namen().
// Den Scope aus requireDienstplanSession() bilden, nie aus Request-Daten.
export async function withDienstplanScope<T>(
  scope: DienstplanScope,
  fn: (tx: ScopedTx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.kamerad_id', ${String(scope.kameradId)}, true)`,
    );
    await tx.execute(
      sql`select set_config('app.dienst_rolle', ${scope.dienstRolle}, true)`,
    );
    await tx.execute(
      sql`select set_config('app.dienst_org', ${String(scope.organisationId)}, true)`,
    );
    return fn(tx);
  });
}

// Anzeige-Scope (Präsentation ohne Login, Migration 0019): setzt nur
// app.dienst_rolle='Anzeige' und app.dienst_anzeige = SHA-256-Hash des Tokens.
// Die Policies zeigen dann genau den Plan des gültigen Tokens, nur lesend.
// Kein app.kamerad_id, kein app.dienst_org: Plan und Organisation bestimmt die
// Datenbank aus der Token-Zeile. Nur aus lib/dienstplan/anzeige.ts aufrufen.
export async function withDienstplanAnzeigeScope<T>(
  tokenHash: string,
  fn: (tx: ScopedTx) => Promise<T>,
): Promise<T> {
  if (!/^[0-9a-f]{64}$/.test(tokenHash)) throw new Error("withDienstplanAnzeigeScope: ungültiger Hash");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.dienst_rolle', 'Anzeige', true)`);
    await tx.execute(sql`select set_config('app.dienst_anzeige', ${tokenHash}, true)`);
    return fn(tx);
  });
}

// iCal-Abo-Scope (Abo-URL ohne Login, Migration 0022): ruft
// dienstplan.abo_scope(hash) auf. Die Datenbank prüft das Token (aktiv, nicht
// widerrufen), zählt den Abruf und setzt für den Rest der Transaktion den
// Lesescope Mitglied der Organisation des Tokens (app.kamerad_id = 0): nur
// freigegebene Pläne, nur lesend. Ungültiges Token → null (Route antwortet 404).
// Nur aus lib/dienstplan/abo.ts aufrufen (Route GET /api/dienstplan/abo/[token]).
export async function withDienstplanAboScope<T>(
  tokenHash: string,
  fn: (tx: ScopedTx, organisationId: number) => Promise<T>,
): Promise<T | null> {
  if (!/^[0-9a-f]{64}$/.test(tokenHash)) return null;
  class Ungueltig extends Error {}
  try {
    return await db.transaction(async (tx) => {
      let org: number;
      try {
        const [r] = await tx.execute<{ org: number }>(sql`select dienstplan.abo_scope(${tokenHash}) as org`);
        org = r.org;
      } catch {
        throw new Ungueltig();
      }
      return fn(tx, org);
    });
  } catch (e) {
    if (e instanceof Ungueltig) return null;
    throw e;
  }
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
