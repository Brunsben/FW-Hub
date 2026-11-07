import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { withScope } from "@/lib/db/scoped";
import { psaWaesche } from "@/lib/db/schema";
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
  const conditions: SQL[] = [];

  const tueckId = toIntOrNull(params.get("ausruestungstueckId"));
  if (tueckId !== null)
    conditions.push(eq(psaWaesche.ausruestungstueckId, tueckId));

  if (session.isUser) {
    conditions.push(eq(psaWaesche.kameradId, session.kameradId));
  } else {
    const kameradId = toIntOrNull(params.get("kameradId"));
    if (kameradId !== null)
      conditions.push(eq(psaWaesche.kameradId, kameradId));
  }

  // psa.waesche liegt hinter RLS → Lesen im Scope; App-Filter bleibt.
  const scope = { kameradId: session.kameradId, psaRolle: session.psaRole };
  const waesche = await withScope(scope, (tx) =>
    tx
      .select()
      .from(psaWaesche)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(psaWaesche.datum)),
  );

  return NextResponse.json({ waesche });
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
  const { waesche, typName } = await withScope(scope, async (tx) => {
    const [waesche] = await tx
      .insert(psaWaesche)
      .values({
        ausruestungstueckId,
        kameradId: toIntOrNull(body.kameradId),
        datum: toStrOrNull(body.datum),
        waescheart: toStrOrNull(body.waescheart) ?? "Normal",
        notizen: toStrOrNull(body.notizen),
      })
      .returning();
    return {
      waesche,
      typName: await typNameByStueck(ausruestungstueckId, tx),
    };
  });
  await logChange(session, "Wäsche", "Gewaschen", typName);

  return NextResponse.json({ waesche }, { status: 201 });
}
