import { sql, type SQL } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { authDb } from "@/lib/db/auth-client";
import { loginAttempts } from "@/lib/db/schema";
import {
  bewerteIp,
  ipSchluessel,
  UNKNOWN_IP,
  type IpSchluessel,
} from "@/lib/client-ip";

// Login-Sperre (Brute-Force-Schutz). Zugriff ausschließlich über authDb
// (fw_auth), weil die Prüfung vor jedem RLS-Scope stattfindet.
//
// Regeln (jeweils WINDOW_MIN Minuten, gezählt werden nur Fehlversuche):
//  * Name + IP: NAME_IP_MAX_FAILS Fehlversuche für denselben Benutzernamen von
//    derselben IP seit dem letzten erfolgreichen Login dieses Namens von dieser
//    IP → gesperrt bis letzter Fehlversuch + WINDOW_MIN. Ein Angreifer sperrt
//    damit nur sich selbst, nicht den echten Nutzer von seiner eigenen IP.
//    Gilt auch für nicht existierende Namen (keine Enumeration).
//  * Name allein: NAME_MAX_FAILS Fehlversuche für denselben Namen von beliebigen
//    IPs seit dem letzten erfolgreichen Login. Hohe Grenze gegen verteilte
//    Angriffe auf ein Konto.
//  * IP: IP_MAX_FAILS Fehlversuche von derselben IP (über alle Namen). Nur, wenn
//    die IP bekannt ist (siehe getClientIp).
//  * IPv6 wird für IP- und Name+IP-Sperre pro /64-Präfix gezählt.
//  * "unbekannt" (keine brauchbare öffentliche Adresse) bildet einen eigenen
//    Zähler. Dann entfällt die IP-Sperre, Name+IP wirkt wie eine Sperre pro Name.
//  * Gesperrte Anfragen werden NICHT als Fehlversuch gezählt; die Sperre läuft
//    also WINDOW_MIN nach dem letzten echten Fehlversuch ab.
//
// Rettungsweg (als Owner, lokal bzw. durch einen Server-Admin):
//   DELETE FROM core.login_attempts WHERE benutzername = '<name>';
// Siehe drizzle/manual/login-sperre.md.
export const WINDOW_MIN = 15;
export const NAME_IP_MAX_FAILS = 5;
export const NAME_MAX_FAILS = 50;
export const IP_MAX_FAILS = 30;
const RETENTION_HOURS = 24;

export { UNKNOWN_IP };

// Eine Warnung pro Wert und Zeitraum, damit eine kaputte Kette das Log nicht flutet.
const WARN_INTERVALL_MS = 10 * 60 * 1000;
const zuletztGewarnt = new Map<string, number>();
function warneEinmal(schluessel: string, text: string): void {
  const jetzt = Date.now();
  const davor = zuletztGewarnt.get(schluessel);
  if (davor !== undefined && jetzt - davor < WARN_INTERVALL_MS) return;
  if (zuletztGewarnt.size > 200) zuletztGewarnt.clear();
  zuletztGewarnt.set(schluessel, jetzt);
  console.warn(text);
}

// Annahme (siehe drizzle/manual/login-sperre.md): Die App ist nur über nginx
// erreichbar, und nginx setzt X-Real-IP selbst ($remote_addr nach Auswertung
// von CF-Connecting-IP) und überschreibt damit Client-Werte. Fallback: letzter
// Eintrag von X-Forwarded-For (von nginx angehängt; die linken Einträge sind
// vom Client fälschbar). Next.js füllt X-Forwarded-For nur, wenn der Header
// fehlt (??=, Socket-Adresse) — es hängt nichts an.
//
// Die Adresse wird geprüft: Ungültige, private, Loopback-, Link-Local- und
// Docker-Adressen gelten als "unbekannt" (mit Warnung im Log). Sie bedeuten
// eine kaputte Proxy-Kette, bei der alle Nutzer dieselbe interne Adresse hätten.
// Dann entfällt die IP-Sperre, statt alle auszusperren.
export function getClientIp(req: NextRequest): string {
  let roh = req.headers.get("x-real-ip")?.trim();
  if (!roh) {
    const xff = req.headers.get("x-forwarded-for");
    if (xff) roh = xff.split(",").map((s) => s.trim()).filter(Boolean).pop();
  }
  if (!roh) return UNKNOWN_IP;

  const bewertung = bewerteIp(roh);
  if (bewertung.ip === UNKNOWN_IP) {
    const anzeige = roh.slice(0, 64).replace(/[^\x20-\x7e]/g, "?");
    warneEinmal(
      `${bewertung.grund}:${anzeige}`,
      `Login-Sperre: Client-IP "${anzeige}" ist ${
        bewertung.grund === "ungueltig" ? "keine gültige Adresse" : "nicht öffentlich"
      }. Die IP-Sperre ist dafür außer Kraft (Name+IP zählt als "unbekannt"). Proxy-Kette prüfen (nginx real_ip, Tunnel).`,
    );
  }
  return bewertung.ip;
}

export interface LockStatus {
  locked: boolean;
  retryAfterSec: number;
}

// Bedingung "gleiche IP" für eine Spalte (Haupttabelle oder Unterabfrage).
function gleicheIp(spalte: SQL, schluessel: IpSchluessel): SQL {
  return schluessel.art === "v6"
    ? sql`${spalte} like ${schluessel.wert}`
    : sql`${spalte} = ${schluessel.wert}`;
}

export async function checkLock(
  benutzername: string,
  ip: string,
): Promise<LockStatus> {
  const window = sql`now() - make_interval(mins => ${WINDOW_MIN})`;
  // Restsperrzeit in Sekunden: letzter Fehlversuch + Fenster − jetzt.
  const retry = sql<number>`coalesce(ceil(extract(epoch from (max(${loginAttempts.createdAt}) + make_interval(mins => ${WINDOW_MIN}) - now())))::int, 0)`;
  const schluessel = ipSchluessel(ip);

  // 1. Name + IP: Fehlversuche seit dem letzten Erfolg dieses Namens von dieser IP.
  const [nameIp] = await authDb
    .select({ fails: sql<number>`count(*)::int`, retry })
    .from(loginAttempts)
    .where(
      sql`${loginAttempts.benutzername} = ${benutzername}
        and ${gleicheIp(sql`${loginAttempts.ip}`, schluessel)}
        and not ${loginAttempts.erfolgreich}
        and ${loginAttempts.createdAt} > ${window}
        and ${loginAttempts.createdAt} > coalesce((
          select max(s.created_at) from core.login_attempts s
          where s.benutzername = ${benutzername} and s.erfolgreich
            and ${gleicheIp(sql.raw("s.ip"), schluessel)}
        ), '-infinity'::timestamptz)`,
    );
  if (nameIp.fails >= NAME_IP_MAX_FAILS) {
    return { locked: true, retryAfterSec: Math.max(1, nameIp.retry) };
  }

  // 2. Name allein: hohe Grenze über alle IPs.
  const [nurName] = await authDb
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
  if (nurName.fails >= NAME_MAX_FAILS) {
    return { locked: true, retryAfterSec: Math.max(1, nurName.retry) };
  }

  // 3. IP: Fehlversuche über alle Namen, nur bei bekannter IP.
  if (schluessel.art !== "unbekannt") {
    const [byIp] = await authDb
      .select({ fails: sql<number>`count(*)::int`, retry })
      .from(loginAttempts)
      .where(
        sql`${gleicheIp(sql`${loginAttempts.ip}`, schluessel)}
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
