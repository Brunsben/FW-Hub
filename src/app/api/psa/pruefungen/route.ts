import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { withScope } from "@/lib/db/scoped";
import { expectRows, NoRowsAffectedError } from "@/lib/db/rows";
import {
  psaAusruestungstuecke,
  psaAusruestungstypen,
  psaPruefungen,
} from "@/lib/db/schema";
import { requirePsaSession } from "@/lib/psa-auth";
import { logChange, typNameByStueck } from "@/lib/psa-changelog";

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
  const conditions = [];

  const tueckId = toIntOrNull(params.get("ausruestungstueckId"));
  if (tueckId !== null)
    conditions.push(eq(psaPruefungen.ausruestungstueckId, tueckId));

  if (session.isUser) {
    conditions.push(eq(psaPruefungen.kameradId, session.kameradId));
  } else {
    const kameradId = toIntOrNull(params.get("kameradId"));
    if (kameradId !== null)
      conditions.push(eq(psaPruefungen.kameradId, kameradId));
  }

  const pruefungen = await db
    .select()
    .from(psaPruefungen)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(psaPruefungen.datum));

  return NextResponse.json({ pruefungen });
}

export async function POST(req: NextRequest) {
  const session = await requirePsaSession();
  if (!session?.canEdit) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 });
  }

  const body = await req.json();
  const ausruestungstueckId = toIntOrNull(body.ausruestungstueckId);
  if (ausruestungstueckId === null) {
    return NextResponse.json(
      { error: "ausruestungstueckId ist erforderlich" },
      { status: 400 },
    );
  }

  const scope = { kameradId: session.kameradId, psaRolle: session.psaRole };

  // Alles in einer gescopten Transaktion: Intervall-Lookup am Stück, Insert
  // der Prüfung und Nachzug von naechste_pruefung am Stück. Trifft der
  // Nachzug keine Zeile (RLS/unbekannte id), wird die Prüfung zurückgerollt.
  let result;
  try {
    result = await withScope(scope, async (tx) => {
      // Nächste Prüfung: explizit mitgesendet ODER serverseitig aus dem
      // Prüfintervall des Ausrüstungstyps (Prüfdatum + Intervall) berechnet.
      let naechste = toStrOrNull(body.naechstePruefung);
      if (!naechste) {
        const [typRow] = await tx
          .select({ intervall: psaAusruestungstypen.pruefintervallMonate })
          .from(psaAusruestungstuecke)
          .leftJoin(
            psaAusruestungstypen,
            eq(psaAusruestungstypen.id, psaAusruestungstuecke.ausruestungstypId),
          )
          .where(eq(psaAusruestungstuecke.id, ausruestungstueckId))
          .limit(1);
        // Stück unsichtbar/unbekannt → abbrechen, auch wenn ohne Intervall
        // später kein UPDATE (und damit keine Zeilenprüfung) folgen würde.
        if (!typRow) throw new NoRowsAffectedError("Prüfung");
        if (typRow.intervall) {
          const basis =
            toStrOrNull(body.datum) ?? new Date().toISOString().slice(0, 10);
          const d = new Date(basis);
          d.setMonth(d.getMonth() + typRow.intervall);
          naechste = d.toISOString().slice(0, 10);
        }
      }

      const [row] = await tx
        .insert(psaPruefungen)
        .values({
          ausruestungstueckId,
          kameradId: toIntOrNull(body.kameradId),
          datum: toStrOrNull(body.datum),
          ergebnis: toStrOrNull(body.ergebnis),
          pruefer: toStrOrNull(body.pruefer),
          naechstePruefung: naechste,
          notizen: toStrOrNull(body.notizen),
          foto: toStrOrNull(body.foto),
        })
        .returning();

      if (naechste) {
        expectRows(
          await tx
            .update(psaAusruestungstuecke)
            .set({ naechstePruefung: naechste, updatedAt: new Date() })
            .where(eq(psaAusruestungstuecke.id, ausruestungstueckId))
            .returning({ id: psaAusruestungstuecke.id }),
          "Prüfung",
        );
      }
      return {
        pruefung: row,
        typName: await typNameByStueck(ausruestungstueckId, tx),
      };
    });
  } catch (e) {
    if (e instanceof NoRowsAffectedError) {
      return NextResponse.json(
        { error: "Ausrüstungsstück nicht gefunden oder nicht berechtigt" },
        { status: 404 },
      );
    }
    throw e;
  }

  await logChange(
    session,
    "Prüfungen",
    "Geprüft",
    `${result.typName} – ${toStrOrNull(body.ergebnis) ?? ""}`,
  );

  return NextResponse.json({ pruefung: result.pruefung }, { status: 201 });
}
