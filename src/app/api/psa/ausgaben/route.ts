import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { withScope } from "@/lib/db/scoped";
import { expectRows, NoRowsAffectedError } from "@/lib/db/rows";
import { psaAusgaben, psaAusruestungstuecke } from "@/lib/db/schema";
import { requirePsaSession } from "@/lib/psa-auth";
import { kameradName, logChange, typNameByStueck } from "@/lib/psa-changelog";

function toIntOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function toStrOrNull(v: unknown): string | null {
  return v == null || v === "" ? null : String(v);
}

const heute = () => new Date().toISOString().slice(0, 10);

const stueckNichtGefunden = () =>
  NextResponse.json(
    { error: "Ausrüstungsstück nicht gefunden oder nicht berechtigt" },
    { status: 404 },
  );

// psa.ausgaben liegt hinter RLS (ausgaben_priv / ausgaben_eigene_lesen) →
// Lesen im Scope. Der App-Filter auf die eigene kamerad_id bleibt zusätzlich.
export async function GET(req: NextRequest) {
  const session = await requirePsaSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const conditions: SQL[] = [];

  const tueckId = toIntOrNull(params.get("ausruestungstueckId"));
  if (tueckId !== null)
    conditions.push(eq(psaAusgaben.ausruestungstueckId, tueckId));

  if (session.isUser) {
    conditions.push(eq(psaAusgaben.kameradId, session.kameradId));
  } else {
    const kameradId = toIntOrNull(params.get("kameradId"));
    if (kameradId !== null)
      conditions.push(eq(psaAusgaben.kameradId, kameradId));
  }

  const scope = { kameradId: session.kameradId, psaRolle: session.psaRole };
  const ausgaben = await withScope(scope, (tx) =>
    tx
      .select()
      .from(psaAusgaben)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(psaAusgaben.ausgabedatum)),
  );

  return NextResponse.json({ ausgaben });
}

export async function POST(req: NextRequest) {
  const session = await requirePsaSession();
  if (!session?.canEdit) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 });
  }

  const body = await req.json();
  const ausruestungstueckId = toIntOrNull(body.ausruestungstueckId);
  const kameradId = toIntOrNull(body.kameradId);
  if (ausruestungstueckId === null || kameradId === null) {
    return NextResponse.json(
      { error: "ausruestungstueckId und kameradId sind erforderlich" },
      { status: 400 },
    );
  }

  const scope = { kameradId: session.kameradId, psaRolle: session.psaRole };

  // Ausgabe: Stück dem Empfänger zuordnen + auf "Ausgegeben" setzen und den
  // Ausgaben-Datensatz anlegen — atomar in einer gescopten Transaktion.
  // Trifft das UPDATE keine Zeile (RLS/unbekannte id), bricht expectRows die
  // Transaktion ab, bevor ein Ausgaben-Datensatz entsteht.
  let result;
  try {
    result = await withScope(scope, async (tx) => {
      expectRows(
        await tx
          .update(psaAusruestungstuecke)
          .set({ kameradId, status: "Ausgegeben", updatedAt: new Date() })
          .where(eq(psaAusruestungstuecke.id, ausruestungstueckId))
          .returning({ id: psaAusruestungstuecke.id }),
        "Ausgabe",
      );

      const [row] = await tx
        .insert(psaAusgaben)
        .values({
          ausruestungstueckId,
          kameradId,
          ausgabedatum: toStrOrNull(body.ausgabedatum) ?? heute(),
          notizen: toStrOrNull(body.notizen),
        })
        .returning();

      return {
        ausgabe: row,
        empfaenger: await kameradName(kameradId, tx),
        typName: await typNameByStueck(ausruestungstueckId, tx),
      };
    });
  } catch (e) {
    if (e instanceof NoRowsAffectedError) return stueckNichtGefunden();
    throw e;
  }

  await logChange(
    session,
    "Ausgaben",
    "Ausgegeben",
    `${result.typName} → ${result.empfaenger}`,
  );

  return NextResponse.json({ ausgabe: result.ausgabe }, { status: 201 });
}

// Rückgabe: setzt das Rueckgabedatum einer offenen Ausgabe.
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

  const scope = { kameradId: session.kameradId, psaRolle: session.psaRole };

  // Rückgabe: Rueckgabedatum setzen und das zugehörige Stück zurück ins Lager
  // (kamerad_id = null, Status "Lager") — atomar in einer gescopten
  // Transaktion. Trifft das Stück-UPDATE keine Zeile, wird alles zurückgerollt.
  let result;
  try {
    result = await withScope(scope, async (tx) => {
      const [row] = await tx
        .update(psaAusgaben)
        .set({
          rueckgabedatum: toStrOrNull(body.rueckgabedatum) ?? heute(),
          updatedAt: new Date(),
        })
        .where(eq(psaAusgaben.id, id))
        .returning();
      if (!row) return null;

      if (row.ausruestungstueckId != null) {
        expectRows(
          await tx
            .update(psaAusruestungstuecke)
            .set({ kameradId: null, status: "Lager", updatedAt: new Date() })
            .where(eq(psaAusruestungstuecke.id, row.ausruestungstueckId))
            .returning({ id: psaAusruestungstuecke.id }),
          "Rückgabe",
        );
      }
      return {
        ausgabe: row,
        typName: await typNameByStueck(row.ausruestungstueckId, tx),
      };
    });
  } catch (e) {
    if (e instanceof NoRowsAffectedError) return stueckNichtGefunden();
    throw e;
  }

  if (!result) {
    return NextResponse.json(
      { error: "Ausgabe nicht gefunden" },
      { status: 404 },
    );
  }

  await logChange(session, "Ausgaben", "Zurückgegeben", result.typName);

  return NextResponse.json({ ausgabe: result.ausgabe });
}
