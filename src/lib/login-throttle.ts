import { sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { authDb } from "@/lib/db/auth-client";
import { loginAttempts } from "@/lib/db/schema";

// Login-Sperre (Brute-Force-Schutz). Zugriff ausschließlich über authDb
// (fw_auth), weil die Prüfung vor jedem RLS-Scope stattfindet.
//
// Regeln:
//  * Benutzer: USER_MAX_FAILS Fehlversuche seit dem letzten erfolgreichen Login
//    innerhalb von WINDOW_MIN Minuten → gesperrt bis letzter Fehlversuch +
//    WINDOW_MIN. Gilt auch für nicht existierende Namen (keine Enumeration).
//  * IP: IP_MAX_FAILS Fehlversuche innerhalb von WINDOW_MIN → gesperrt.
//    Nur, wenn die IP bekannt ist (siehe getClientIp).
//  * Gesperrte Anfragen werden NICHT als Fehlversuch gezählt; die Sperre läuft
//    also WINDOW_MIN nach dem letzten echten Fehlversuch ab.
//
// Rettungsweg (als Owner, lokal bzw. durch einen Server-Admin):
//   DELETE FROM core.login_attempts WHERE benutzername = '<name>';
// Siehe drizzle/manual/login-sperre.md.
export const WINDOW_MIN = 15;
export const USER_MAX_FAILS = 5;
export const IP_MAX_FAILS = 30;
const RETENTION_HOURS = 24;

export const UNKNOWN_IP = "unbekannt";

// Annahme (siehe drizzle/manual/login-sperre.md): Die App ist nur über nginx
// erreichbar, und nginx setzt X-Real-IP selbst ($remote_addr nach Auswertung
// von CF-Connecting-IP) und überschreibt damit Client-Werte. Fallback: letzter
// Eintrag von X-Forwarded-For (von nginx angehängt; die linken Einträge sind
// vom Client fälschbar). Next.js füllt X-Forwarded-For nur, wenn der Header
// fehlt (??=, Socket-Adresse) — es hängt nichts an. "unbekannt" tritt daher
// praktisch nur auf, wenn keine Socket-Adresse vorliegt.
export function getClientIp(req: NextRequest): string {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const last = xff.split(",").map((s) => s.trim()).filter(Boolean).pop();
    if (last) return last;
  }
  return UNKNOWN_IP;
}

export interface LockStatus {
  locked: boolean;
  retryAfterSec: number;
}

export async function checkLock(
  benutzername: string,
  ip: string,
): Promise<LockStatus> {
  const window = sql`now() - make_interval(mins => ${WINDOW_MIN})`;
  // Restsperrzeit in Sekunden: letzter Fehlversuch + Fenster − jetzt.
  const retry = sql<number>`coalesce(ceil(extract(epoch from (max(${loginAttempts.createdAt}) + make_interval(mins => ${WINDOW_MIN}) - now())))::int, 0)`;

  const [user] = await authDb
    .select({ fails: sql<number>`count(*)::int`, retry })
    .from(loginAttempts)
    .where(
      sql`${loginAttempts.benutzername} = ${benutzername}
        and not ${loginAttempts.erfolgreich}
        and ${loginAttempts.createdAt} > ${window}
        and ${loginAttempts.createdAt} > coalesce((
          select max(s.created_at) from core.login_attempts s
          where s.benutzername = ${benutzername} and s.erfolgreich
        ), '-infinity'::timestamptz)`,
    );

  if (user.fails >= USER_MAX_FAILS) {
    return { locked: true, retryAfterSec: Math.max(1, user.retry) };
  }

  if (ip !== UNKNOWN_IP) {
    const [byIp] = await authDb
      .select({ fails: sql<number>`count(*)::int`, retry })
      .from(loginAttempts)
      .where(
        sql`${loginAttempts.ip} = ${ip}
          and not ${loginAttempts.erfolgreich}
          and ${loginAttempts.createdAt} > ${window}`,
      );
    if (byIp.fails >= IP_MAX_FAILS) {
      return { locked: true, retryAfterSec: Math.max(1, byIp.retry) };
    }
  }

  return { locked: false, retryAfterSec: 0 };
}

export async function recordAttempt(
  benutzername: string,
  ip: string,
  erfolgreich: boolean,
): Promise<void> {
  await authDb.insert(loginAttempts).values({ benutzername, ip, erfolgreich });
  // Opportunistisches Aufräumen alter Einträge.
  await authDb
    .delete(loginAttempts)
    .where(
      sql`${loginAttempts.createdAt} < now() - make_interval(hours => ${RETENTION_HOURS})`,
    );
}
