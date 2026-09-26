import { redirect } from "next/navigation";
import { and, asc, count, eq, isNotNull, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  kameraden,
  psaAusruestungstuecke,
  psaAusruestungstypen,
  psaKameradDetails,
} from "@/lib/db/schema";
import { requirePsaSession } from "@/lib/psa-auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  KameradenManager,
  type KameradRow,
} from "@/components/psa/kameraden-manager";
import {
  AusruestungManager,
  type KameradOption,
  type PieceRow,
  type TypOption,
} from "@/components/psa/ausruestung-manager";

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

const pieceSelection = {
  id: psaAusruestungstuecke.id,
  seriennummer: psaAusruestungstuecke.seriennummer,
  status: psaAusruestungstuecke.status,
  ausruestungstypId: psaAusruestungstuecke.ausruestungstypId,
  typName: psaAusruestungstypen.bezeichnung,
  kameradId: psaAusruestungstuecke.kameradId,
  kameradVorname: kameraden.vorname,
  kameradNachname: kameraden.name,
  naechstePruefung: psaAusruestungstuecke.naechstePruefung,
};

function toPieceRows(
  rows: Array<{
    id: number;
    seriennummer: string | null;
    status: string | null;
    ausruestungstypId: number | null;
    typName: string | null;
    kameradId: number | null;
    kameradVorname: string | null;
    kameradNachname: string | null;
    naechstePruefung: string | null;
  }>,
): PieceRow[] {
  return rows.map((r) => ({
    id: r.id,
    seriennummer: r.seriennummer,
    status: r.status,
    ausruestungstypId: r.ausruestungstypId,
    typName: r.typName,
    kameradId: r.kameradId,
    kameradName: r.kameradId
      ? `${r.kameradVorname} ${r.kameradNachname}`
      : null,
    naechstePruefung: r.naechstePruefung,
  }));
}

export default async function PsaPage() {
  const session = await requirePsaSession();
  if (!session) redirect("/login");

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const typenRows = await db
    .select({
      id: psaAusruestungstypen.id,
      bezeichnung: psaAusruestungstypen.bezeichnung,
    })
    .from(psaAusruestungstypen)
    .orderBy(asc(psaAusruestungstypen.bezeichnung));
  const typen: TypOption[] = typenRows;

  // Einsatzleiter/User: nur eigene Ausrüstung, keine Verwaltung, kein Schreiben.
  if (!session.canEdit) {
    const rows = await db
      .select(pieceSelection)
      .from(psaAusruestungstuecke)
      .leftJoin(
        psaAusruestungstypen,
        eq(psaAusruestungstypen.id, psaAusruestungstuecke.ausruestungstypId),
      )
      .leftJoin(kameraden, eq(kameraden.id, psaAusruestungstuecke.kameradId))
      .where(eq(psaAusruestungstuecke.kameradId, session.kameradId))
      .orderBy(asc(psaAusruestungstuecke.seriennummer));
    const pieces = toPieceRows(rows);
    const faellig = pieces.filter(
      (p) => p.naechstePruefung && p.naechstePruefung <= cutoffStr,
    ).length;

    return (
      <main className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
        <div>
          <h1 className="text-2xl font-bold">Meine Ausrüstung</h1>
          <p className="text-sm text-muted-foreground">
            Angemeldet als {session.kameradName} ({session.psaRole})
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard label="Meine Stücke" value={pieces.length} />
          <StatCard label="Prüfung fällig" value={faellig} />
        </div>
        <AusruestungManager
          pieces={pieces}
          typen={typen}
          kameraden={[]}
          canEdit={false}
        />
      </main>
    );
  }

  // Admin/Kleiderwart: Dashboard + Verwaltung.
  const [
    [{ value: aktiveKameraden }],
    [{ value: ausruestungGesamt }],
    [{ value: ausgegeben }],
    [{ value: pruefungFaellig }],
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(kameraden)
      .where(eq(kameraden.aktiv, true)),
    db.select({ value: count() }).from(psaAusruestungstuecke),
    db
      .select({ value: count() })
      .from(psaAusruestungstuecke)
      .where(eq(psaAusruestungstuecke.status, "Ausgegeben")),
    db
      .select({ value: count() })
      .from(psaAusruestungstuecke)
      .where(
        and(
          isNotNull(psaAusruestungstuecke.naechstePruefung),
          lte(psaAusruestungstuecke.naechstePruefung, cutoffStr),
        ),
      ),
  ]);

  const kameradenRows: KameradRow[] = await db
    .select({
      id: kameraden.id,
      vorname: kameraden.vorname,
      name: kameraden.name,
      dienstgrad: kameraden.dienstgrad,
      email: kameraden.email,
      personalnummer: kameraden.personalnummer,
      kartenId: kameraden.kartenId,
      aktiv: kameraden.aktiv,
      jackeGroesse: psaKameradDetails.jackeGroesse,
      hoseGroesse: psaKameradDetails.hoseGroesse,
      stiefelGroesse: psaKameradDetails.stiefelGroesse,
      handschuhGroesse: psaKameradDetails.handschuhGroesse,
      hemdGroesse: psaKameradDetails.hemdGroesse,
      poloshirtGroesse: psaKameradDetails.poloshirtGroesse,
      fleeceGroesse: psaKameradDetails.fleeceGroesse,
    })
    .from(kameraden)
    .leftJoin(psaKameradDetails, eq(psaKameradDetails.kameradId, kameraden.id))
    .orderBy(asc(kameraden.name), asc(kameraden.vorname));

  const pieceRows = await db
    .select(pieceSelection)
    .from(psaAusruestungstuecke)
    .leftJoin(
      psaAusruestungstypen,
      eq(psaAusruestungstypen.id, psaAusruestungstuecke.ausruestungstypId),
    )
    .leftJoin(kameraden, eq(kameraden.id, psaAusruestungstuecke.kameradId))
    .orderBy(asc(psaAusruestungstuecke.seriennummer));
  const pieces = toPieceRows(pieceRows);

  const kameradenOptions: KameradOption[] = kameradenRows
    .filter((k) => k.aktiv)
    .map((k) => ({ id: k.id, label: `${k.vorname} ${k.name}` }));

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">PSA-Verwaltung</h1>
        <p className="text-sm text-muted-foreground">
          Angemeldet als {session.kameradName} ({session.psaRole})
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Aktive Kameraden" value={aktiveKameraden} />
        <StatCard label="Ausrüstungsstücke" value={ausruestungGesamt} />
        <StatCard label="Ausgegeben" value={ausgegeben} />
        <StatCard label="Prüfung fällig" value={pruefungFaellig} />
      </div>

      <section id="kameraden" className="scroll-mt-4">
        <KameradenManager kameraden={kameradenRows} />
      </section>

      <section id="ausruestung" className="scroll-mt-4">
        <AusruestungManager
          pieces={pieces}
          typen={typen}
          kameraden={kameradenOptions}
          canEdit
        />
      </section>
    </main>
  );
}
