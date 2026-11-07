import { NextResponse } from "next/server";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
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

export function konfliktResponse(e: unknown): NextResponse | null {
  if (e instanceof BenutzerKonflikt) {
    return NextResponse.json({ error: e.message }, { status: 409 });
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

// Invariante: Wird core.kameraden.aktiv auf false gesetzt, werden die
// verknüpften Benutzer in DERSELBEN Transaktion deaktiviert und ihre
// token_version erhöht. Aufruf vor/nach dem UPDATE auf core.kameraden in der
// gescopten Transaktion des Aufrufers (PSA: Admin/Kleiderwart dürfen laut
// benutzer_scope core.benutzer schreiben).
export async function deaktiviereBenutzerVonKamerad(
  tx: ScopedTx,
  kameradId: number,
  ausfuehrenderKameradId: number,
): Promise<number> {
  const verknuepft = await tx
    .select({ id: benutzer.id, rolle: benutzer.rolle })
    .from(benutzer)
    .where(and(eq(benutzer.kameradId, kameradId), eq(benutzer.aktiv, true)))
    .for("update");
  if (verknuepft.length === 0) return 0;

  if (kameradId === ausfuehrenderKameradId) {
    throw new BenutzerKonflikt(
      "Der eigene Kamerad kann nicht deaktiviert werden (eigener Benutzer wäre gesperrt).",
    );
  }
  if (verknuepft.some((b) => b.rolle === "Admin")) {
    await assertAdminsRemain(
      tx,
      verknuepft.map((b) => b.id),
    );
  }

  const ids = verknuepft.map((b) => b.id);
  const updated = await tx
    .update(benutzer)
    .set({
      aktiv: false,
      tokenVersion: sql`${benutzer.tokenVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(inArray(benutzer.id, ids))
    .returning({ id: benutzer.id });
  if (updated.length !== ids.length) {
    // RLS hat Zeilen verborgen → nicht still weiterarbeiten.
    throw new Error("Benutzer-Deaktivierung unvollständig (RLS)");
  }
  return updated.length;
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
