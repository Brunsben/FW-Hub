import { NextResponse } from "next/server";
import { and, eq, notInArray } from "drizzle-orm";
import { getAuthUser, isGlobalAdmin, type JwtPayload } from "@/lib/auth";
import type { ScopedTx } from "@/lib/db/scoped";
import { benutzer } from "@/lib/db/schema";

// ── Zugriffsschutz für /api/admin/* ─────────────────────────────────────────
// Ohne gültige Session 401, ohne globale Admin-Rolle (app_role) 403.
export async function requireGlobalAdmin(): Promise<
  { ok: true; user: JwtPayload } | { ok: false; response: NextResponse }
> {
  const user = await getAuthUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 }),
    };
  }
  if (!isGlobalAdmin(user)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 }),
    };
  }
  return { ok: true, user };
}

// ── Fachliche Konflikte (→ 409) ─────────────────────────────────────────────
export class BenutzerKonflikt extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BenutzerKonflikt";
  }
}

// SQLSTATE, mit dem die Datenbank fachliche Konflikte meldet (Trigger
// core.kamerad_deaktiviert: letzter Admin, eigener Kamerad). Die Meldung steht
// im Fehler der postgres-js-Ebene, drizzle verpackt sie in `cause`.
const PG_FACHKONFLIKT = "FW001";

function datenbankKonflikt(e: unknown): string | null {
  let cur: unknown = e;
  for (let depth = 0; depth < 3 && cur && typeof cur === "object"; depth++) {
    const { code, message, cause } = cur as {
      code?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    if (code === PG_FACHKONFLIKT && typeof message === "string") return message;
    cur = cause;
  }
  return null;
}

export function konfliktResponse(e: unknown): NextResponse | null {
  if (e instanceof BenutzerKonflikt) {
    return NextResponse.json({ error: e.message }, { status: 409 });
  }
  const meldung = datenbankKonflikt(e);
  if (meldung) {
    return NextResponse.json({ error: meldung }, { status: 409 });
  }
  return null;
}

// Invariante: Es bleibt immer mindestens ein aktiver Admin (core.benutzer.rolle
// = 'Admin'). Sperrt alle übrigen aktiven Admin-Zeilen (FOR UPDATE), damit zwei
// gleichzeitige Vorgänge nicht beide "den anderen" als verbleibend zählen.
export async function assertAdminsRemain(
  tx: ScopedTx,
  wegfallendeBenutzerIds: number[],
): Promise<void> {
  const conditions = [eq(benutzer.rolle, "Admin"), eq(benutzer.aktiv, true)];
  if (wegfallendeBenutzerIds.length > 0) {
    conditions.push(notInArray(benutzer.id, wegfallendeBenutzerIds));
  }
  const rest = await tx
    .select({ id: benutzer.id })
    .from(benutzer)
    .where(and(...conditions))
    .for("update");
  if (rest.length === 0) {
    throw new BenutzerKonflikt(
      "Der letzte aktive Admin kann nicht deaktiviert oder herabgestuft werden.",
    );
  }
}

// Sichere Projektion für API-Antworten — niemals den PIN-Hash.
export const benutzerOhnePin = {
  id: benutzer.id,
  benutzername: benutzer.benutzername,
  rolle: benutzer.rolle,
  kameradId: benutzer.kameradId,
  aktiv: benutzer.aktiv,
  createdAt: benutzer.createdAt,
  updatedAt: benutzer.updatedAt,
};

export const MIN_PIN_LAENGE = 6;
