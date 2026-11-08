import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { withGlobalAdminPsaScope, withScope } from "@/lib/db/scoped";
import { psaAusruestungstuecke } from "@/lib/db/schema";
import { requirePsaSession } from "@/lib/psa-auth";
import { requireGlobalAdmin } from "@/lib/benutzer-admin";
import { logChange, typNameById } from "@/lib/psa-changelog";

function toIntOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function toStrOrNull(v: unknown): string | null {
  return v == null || v === "" ? null : String(v);
}

export async function GET(req: NextRequest) {
  const session = await requirePsaSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const conditions: SQL[] = [];

  const typId = toIntOrNull(params.get("ausruestungstypId"));
  if (typId !== null)
    conditions.push(eq(psaAusruestungstuecke.ausruestungstypId, typId));

  const status = params.get("status");
  if (status) conditions.push(eq(psaAusruestungstuecke.status, status));

  if (session.isUser) {
    // User: unabhängig von Filtern immer nur eigene Stücke.
    conditions.push(eq(psaAusruestungstuecke.kameradId, session.kameradId));
  } else {
    const kameradId = toIntOrNull(params.get("kameradId"));
    if (kameradId !== null)
      conditions.push(eq(psaAusruestungstuecke.kameradId, kameradId));
  }

  const scope = { kameradId: session.kameradId, psaRolle: session.psaRole };
  const stuecke = await withScope(scope, (tx) =>
    tx
      .select()
      .from(psaAusruestungstuecke)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(psaAusruestungstuecke.createdAt)),
  );

  return NextResponse.json({ stuecke });
}

export async function POST(req: NextRequest) {
  const session = await requirePsaSession();
  if (!session?.canEdit) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 });
  }

  const body = await req.json();
  const scope = { kameradId: session.kameradId, psaRolle: session.psaRole };

  const [stueck] = await withScope(scope, (tx) =>
    tx
      .insert(psaAusruestungstuecke)
      .values({
        ausruestungstypId: toIntOrNull(body.ausruestungstypId),
        seriennummer: toStrOrNull(body.seriennummer),
        status: toStrOrNull(body.status),
        kaufdatum: toStrOrNull(body.kaufdatum),
        herstellungsdatum: toStrOrNull(body.herstellungsdatum),
        naechstePruefung: toStrOrNull(body.naechstePruefung),
        letztePruefung: toStrOrNull(body.letztePruefung),
        lebensendeDatum: toStrOrNull(body.lebensendeDatum),
        qrCode: toStrOrNull(body.qrCode),
        waescheAnzahl: toIntOrNull(body.waescheAnzahl) ?? 0,
        groesse: toStrOrNull(body.groesse),
        notizen: toStrOrNull(body.notizen),
        kameradId: toIntOrNull(body.kameradId),
      })
      .returning(),
  );

  const typName = await typNameById(stueck.ausruestungstypId);
  await logChange(
    session,
    "Ausrüstung",
    "Erstellt",
    `${typName} (${stueck.seriennummer ?? ""})`,
  );

  return NextResponse.json({ stueck }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await requirePsaSession();
  if (!session?.canEdit) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 });
  }

  const body = await req.json();
  const id = Number(body.id);
  if (!id || Number.isNaN(id)) {
    return NextResponse.json({ error: "id erforderlich" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if ("ausruestungstypId" in body)
    update.ausruestungstypId = toIntOrNull(body.ausruestungstypId);
  if ("seriennummer" in body)
    update.seriennummer = toStrOrNull(body.seriennummer);
  if ("status" in body) update.status = toStrOrNull(body.status);
  if ("kaufdatum" in body) update.kaufdatum = toStrOrNull(body.kaufdatum);
  if ("herstellungsdatum" in body)
    update.herstellungsdatum = toStrOrNull(body.herstellungsdatum);
  if ("naechstePruefung" in body)
    update.naechstePruefung = toStrOrNull(body.naechstePruefung);
  if ("letztePruefung" in body)
    update.letztePruefung = toStrOrNull(body.letztePruefung);
  if ("lebensendeDatum" in body)
    update.lebensendeDatum = toStrOrNull(body.lebensendeDatum);
  if ("qrCode" in body) update.qrCode = toStrOrNull(body.qrCode);
  if ("waescheAnzahl" in body)
    update.waescheAnzahl = toIntOrNull(body.waescheAnzahl) ?? 0;
  if ("groesse" in body) update.groesse = toStrOrNull(body.groesse);
  if ("notizen" in body) update.notizen = toStrOrNull(body.notizen);
  if ("kameradId" in body) update.kameradId = toIntOrNull(body.kameradId);

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "Keine Felder zum Aktualisieren" },
      { status: 400 },
    );
  }
  update.updatedAt = new Date();
  const scope = { kameradId: session.kameradId, psaRolle: session.psaRole };

  // 0 Zeilen (unbekannt/nicht berechtigt) → 404 unten, kein Erfolg.
  const [stueck] = await withScope(scope, (tx) =>
    tx
      .update(psaAusruestungstuecke)
      .set(update)
      .where(eq(psaAusruestungstuecke.id, id))
      .returning(),
  );

  if (!stueck) {
    return NextResponse.json(
      { error: "Ausrüstungsstück nicht gefunden" },
      { status: 404 },
    );
  }

  const typName = await typNameById(stueck.ausruestungstypId);
  await logChange(
    session,
    "Ausrüstung",
    "Bearbeitet",
    `${typName} (${stueck.seriennummer ?? ""})`,
  );

  return NextResponse.json({ stueck });
}

// Hartes Löschen nur für den globalen Admin und nur ohne Historie. Ausgaben,
// Prüfungen, Wäsche und Schäden hängen per ON DELETE CASCADE am Stück und
// würden sonst mitgelöscht. Stücke mit Historie werden über den Status
// "Ausgesondert" stillgelegt (PATCH), nicht gelöscht.
//
// Scope: withGlobalAdminPsaScope (nach requireGlobalAdmin). Mit dem PSA-Scope der
// Session sähe ein globaler Admin mit psa_rolle "User" unter RLS nur eigene
// Historienzeilen; die Prüfung hielte ein eigenes Stück mit fremder Historie
// für historienlos, und die Kaskade (läuft ohne RLS) löschte fremde Historie.
export async function DELETE(req: NextRequest) {
  const guard = await requireGlobalAdmin();
  if (!guard.ok) return guard.response;
  const admin = guard.user;

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id || Number.isNaN(id)) {
    return NextResponse.json({ error: "id erforderlich" }, { status: 400 });
  }

  const outcome = await withGlobalAdminPsaScope(admin, async (tx) => {
    // Zeile sperren: Neue Historie (FK → FOR KEY SHARE am Stück) wartet, bis
    // diese Transaktion fertig ist. Damit kann zwischen Prüfung und DELETE
    // keine Historie entstehen.
    const [stueck] = await tx
      .select({ id: psaAusruestungstuecke.id })
      .from(psaAusruestungstuecke)
      .where(eq(psaAusruestungstuecke.id, id))
      .for("update");
    if (!stueck) return { kind: "notFound" as const };

    const [{ historie }] = await tx.execute<{ historie: boolean }>(sql`
      select exists (select 1 from psa.ausgaben where ausruestungstueck_id = ${id})
          or exists (select 1 from psa.pruefungen where ausruestungstueck_id = ${id})
          or exists (select 1 from psa.waesche where ausruestungstueck_id = ${id})
          or exists (select 1 from psa.schadensdokumentation where ausruestungstueck_id = ${id})
          as historie`);
    if (historie) return { kind: "hasHistory" as const };

    const [deleted] = await tx
      .delete(psaAusruestungstuecke)
      .where(eq(psaAusruestungstuecke.id, id))
      .returning({
        id: psaAusruestungstuecke.id,
        ausruestungstypId: psaAusruestungstuecke.ausruestungstypId,
        seriennummer: psaAusruestungstuecke.seriennummer,
      });
    return { kind: "deleted" as const, deleted };
  });

  if (outcome.kind === "notFound") {
    return NextResponse.json(
      { error: "Ausrüstungsstück nicht gefunden" },
      { status: 404 },
    );
  }
  if (outcome.kind === "hasHistory") {
    return NextResponse.json(
      {
        error:
          'Das Stück hat eine Historie (Ausgabe, Prüfung, Wäsche oder Schaden) und kann nicht gelöscht werden. Bitte stattdessen den Status "Ausgesondert" setzen.',
      },
      { status: 409 },
    );
  }
  const { deleted } = outcome;

  const typName = await typNameById(deleted.ausruestungstypId);
  await logChange(
    { benutzername: admin.sub },
    "Ausrüstung",
    "Gelöscht",
    `${typName} (${deleted.seriennummer ?? ""})`,
  );

  return NextResponse.json({ id: deleted.id });
}
