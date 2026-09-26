import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { kameraden, psaKameradDetails } from "@/lib/db/schema";
import { withScope } from "@/lib/db/scoped";
import { requirePsaSession } from "@/lib/psa-auth";
import { logChange } from "@/lib/psa-changelog";

// Größenfelder liegen in psa.kamerad_details, werden aber gemeinsam mit dem
// Kameraden ausgeliefert/entgegengenommen.
const SIZE_FIELDS = [
  "jackeGroesse",
  "hoseGroesse",
  "stiefelGroesse",
  "handschuhGroesse",
  "hemdGroesse",
  "poloshirtGroesse",
  "fleeceGroesse",
] as const;

type SizeField = (typeof SIZE_FIELDS)[number];

function extractSizes(body: Record<string, unknown>) {
  const sizes: Partial<Record<SizeField, string | null>> = {};
  let present = false;
  for (const f of SIZE_FIELDS) {
    if (f in body) {
      sizes[f] = body[f] == null ? null : String(body[f]);
      present = true;
    }
  }
  return { sizes, present };
}

const kameradSelection = {
  id: kameraden.id,
  name: kameraden.name,
  vorname: kameraden.vorname,
  dienstgrad: kameraden.dienstgrad,
  email: kameraden.email,
  personalnummer: kameraden.personalnummer,
  kartenId: kameraden.kartenId,
  aktiv: kameraden.aktiv,
  psaRolle: kameraden.psaRolle,
  jackeGroesse: psaKameradDetails.jackeGroesse,
  hoseGroesse: psaKameradDetails.hoseGroesse,
  stiefelGroesse: psaKameradDetails.stiefelGroesse,
  handschuhGroesse: psaKameradDetails.handschuhGroesse,
  hemdGroesse: psaKameradDetails.hemdGroesse,
  poloshirtGroesse: psaKameradDetails.poloshirtGroesse,
  fleeceGroesse: psaKameradDetails.fleeceGroesse,
};

export async function GET(req: NextRequest) {
  const session = await requirePsaSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const nurAktiv = req.nextUrl.searchParams.get("nurAktiv") === "true";
  const scope = { kameradId: session.kameradId, psaRolle: session.psaRole };

  const kameradenList = await withScope(scope, async (tx) => {
    const conditions = [];
    // User sehen nur den eigenen Datensatz (zusätzlich zur RLS-Policy).
    if (session.isUser) conditions.push(eq(kameraden.id, session.kameradId));
    // ?nurAktiv=true blendet inaktive aus (z.B. für Zuteilungs-Dropdowns).
    if (nurAktiv) conditions.push(eq(kameraden.aktiv, true));

    return tx
      .select(kameradSelection)
      .from(kameraden)
      .leftJoin(psaKameradDetails, eq(psaKameradDetails.kameradId, kameraden.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(kameraden.name), asc(kameraden.vorname));
  });

  return NextResponse.json({ kameraden: kameradenList });
}

export async function POST(req: NextRequest) {
  const session = await requirePsaSession();
  if (!session?.canEdit) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 });
  }

  const body = await req.json();
  if (!body.name || !body.vorname) {
    return NextResponse.json(
      { error: "name und vorname sind erforderlich" },
      { status: 400 },
    );
  }

  const { sizes, present } = extractSizes(body);
  const scope = { kameradId: session.kameradId, psaRolle: session.psaRole };

  const kamerad = await withScope(scope, async (tx) => {
    const [k] = await tx
      .insert(kameraden)
      .values({
        name: String(body.name),
        vorname: String(body.vorname),
        dienstgrad: body.dienstgrad ? String(body.dienstgrad) : null,
        email: body.email ? String(body.email) : null,
        personalnummer: body.personalnummer
          ? String(body.personalnummer)
          : null,
        kartenId: body.kartenId ? String(body.kartenId) : null,
        aktiv: body.aktiv === undefined ? true : Boolean(body.aktiv),
        psaRolle: body.psaRolle ? String(body.psaRolle) : null,
      })
      .returning();

    if (present) {
      await tx
        .insert(psaKameradDetails)
        .values({ kameradId: k.id, ...sizes });
    }
    return k;
  });

  await logChange(
    session,
    "Kameraden",
    "Erstellt",
    `${kamerad.vorname} ${kamerad.name}`,
  );

  return NextResponse.json({ kamerad }, { status: 201 });
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

  const coreUpdate: Record<string, unknown> = {};
  if ("name" in body) coreUpdate.name = String(body.name);
  if ("vorname" in body) coreUpdate.vorname = String(body.vorname);
  if ("dienstgrad" in body)
    coreUpdate.dienstgrad = body.dienstgrad ? String(body.dienstgrad) : null;
  if ("email" in body) coreUpdate.email = body.email ? String(body.email) : null;
  if ("personalnummer" in body)
    coreUpdate.personalnummer = body.personalnummer
      ? String(body.personalnummer)
      : null;
  if ("kartenId" in body)
    coreUpdate.kartenId = body.kartenId ? String(body.kartenId) : null;
  if ("aktiv" in body) coreUpdate.aktiv = Boolean(body.aktiv);
  if ("psaRolle" in body)
    coreUpdate.psaRolle = body.psaRolle ? String(body.psaRolle) : null;

  const { sizes, present } = extractSizes(body);
  const scope = { kameradId: session.kameradId, psaRolle: session.psaRole };

  const kamerad = await withScope(scope, async (tx) => {
    let updated;
    if (Object.keys(coreUpdate).length > 0) {
      coreUpdate.updatedAt = new Date();
      [updated] = await tx
        .update(kameraden)
        .set(coreUpdate)
        .where(eq(kameraden.id, id))
        .returning();
    } else {
      [updated] = await tx
        .select()
        .from(kameraden)
        .where(eq(kameraden.id, id));
    }

    if (present) {
      await tx
        .insert(psaKameradDetails)
        .values({ kameradId: id, ...sizes })
        .onConflictDoUpdate({
          target: psaKameradDetails.kameradId,
          set: { ...sizes, updatedAt: new Date() },
        });
    }
    return updated;
  });

  if (!kamerad) {
    return NextResponse.json(
      { error: "Kamerad nicht gefunden" },
      { status: 404 },
    );
  }

  await logChange(
    session,
    "Kameraden",
    "Bearbeitet",
    `${kamerad.vorname} ${kamerad.name}`,
  );

  return NextResponse.json({ kamerad });
}

export async function DELETE(req: NextRequest) {
  const session = await requirePsaSession();
  if (!session?.canEdit) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 });
  }

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id || Number.isNaN(id)) {
    return NextResponse.json({ error: "id erforderlich" }, { status: 400 });
  }

  // Soft-Delete: core.kameraden ist modulübergreifend referenziert und wird
  // nie hart gelöscht — nur deaktiviert.
  const scope = { kameradId: session.kameradId, psaRolle: session.psaRole };
  const rows = await withScope(scope, (tx) =>
    tx
      .update(kameraden)
      .set({ aktiv: false, updatedAt: new Date() })
      .where(eq(kameraden.id, id))
      .returning({
        id: kameraden.id,
        vorname: kameraden.vorname,
        name: kameraden.name,
      }),
  );
  const deactivated = rows[0];

  if (!deactivated) {
    return NextResponse.json(
      { error: "Kamerad nicht gefunden" },
      { status: 404 },
    );
  }

  await logChange(
    session,
    "Kameraden",
    "Deaktiviert",
    `${deactivated.vorname} ${deactivated.name}`,
  );

  return NextResponse.json({ id: deactivated.id, aktiv: false });
}
