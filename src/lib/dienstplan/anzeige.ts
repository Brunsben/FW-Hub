import { createHash, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { withDienstplanAnzeigeScope, type ScopedTx } from "@/lib/db/scoped";
import { findePlanPerId, type DpPlan } from "@/lib/dienstplan/plan";
import { fehler } from "@/lib/dienstplan/route";

// Anzeige-Token für die Präsentation (Spec 6 und 7.3, Migration 0019).
// - 32 Zufallsbytes, base64url (43 Zeichen). In der Datenbank steht nur der
//   SHA-256-Hash; das Token selbst steht nur in der Antwort auf POST.
// - Gültig 12 Stunden, nur Lesen, nur der eine Plan, ohne Notizen.
// - Übertragung im Header X-Dienstplan-Anzeige. Die Seite trägt das Token im
//   URL-Fragment (#t=…), das der Browser nie an den Server schickt; so landet es
//   nicht in Zugriffsprotokollen von nginx oder Cloudflare.

export const ANZEIGE_GUELTIG_STUNDEN = 12;
export const ANZEIGE_HEADER = "x-dienstplan-anzeige";

export function neuesAnzeigeToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashAnzeigeToken(token)! };
}

/** Hash eines Tokens; null bei falschem Format (dann gar nicht erst in die Datenbank). */
export function hashAnzeigeToken(token: string | null | undefined): string | null {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return createHash("sha256").update(token).digest("hex");
}

export interface AnzeigeKontext {
  tx: ScopedTx;
  plan: DpPlan & { organisationId: number };
  gueltigBis: string;
}

/**
 * Rahmen für Token-Routen: 401 ohne, mit falschem oder abgelaufenem Token,
 * 403 wenn das Token zu einem anderen Plan gehört. Die Plan-ID kommt aus der
 * Token-Zeile (RLS zeigt nur die gültige Zeile zum Hash), nie aus dem Request.
 */
export async function anzeigeRoute(
  req: Request,
  jahr: number,
  arbeit: (k: AnzeigeKontext) => Promise<Response>,
): Promise<Response> {
  const hash = hashAnzeigeToken(req.headers.get(ANZEIGE_HEADER));
  if (!hash) return fehler(401, "Anzeige-Link fehlt oder ist ungültig");
  return withDienstplanAnzeigeScope(hash, async (tx) => {
    const [t] = await tx.execute<{ planId: number; gueltigBis: string }>(sql`
      select plan_id as "planId", to_char(gueltig_bis at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "gueltigBis"
        from dienstplan.anzeige_tokens`);
    if (!t) return fehler(401, "Anzeige-Link ungültig oder abgelaufen");
    const plan = await findePlanPerId(tx, t.planId);
    if (!plan) return fehler(401, "Anzeige-Link ungültig oder abgelaufen");
    if (plan.jahr !== jahr) return fehler(403, "Der Anzeige-Link gilt für einen anderen Plan");
    return arbeit({ tx, plan, gueltigBis: t.gueltigBis });
  });
}
