import { redirectNoModuleAccess } from "@/lib/module-guard";
import { and, asc, count, eq, isNotNull, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { withScope } from "@/lib/db/scoped";
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
  GroessenUebersicht,
  type GroessenZeile,
} from "@/components/psa/groessen-uebersicht";
import { mitgliedLinkZiel } from "@/lib/mitglieder/rechte";
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
  kaufdatum: psaAusruestungstuecke.kaufdatum,
  herstellungsdatum: psaAusruestungstuecke.herstellungsdatum,
  lebensendeDatum: psaAusruestungstuecke.lebensendeDatum,
  groesse: psaAusruestungstuecke.groesse,
  notizen: psaAusruestungstuecke.notizen,
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
    kaufdatum: string | null;
    herstellungsdatum: string | null;
    lebensendeDatum: string | null;
    groesse: string | null;
    notizen: string | null;
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
    kaufdatum: r.kaufdatum,
    herstellungsdatum: r.herstellungsdatum,
    lebensendeDatum: r.lebensendeDatum,
    groesse: r.groesse,
    notizen: r.notizen,
  }));
}

export default async function PsaPage() {
  const session = await requirePsaSession();
  if (!session) return redirectNoModuleAccess("psa");

  const scope = { kameradId: session.kameradId, psaRolle: session.psaRole };

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
    const rows = await withScope(scope, (tx) =>
      tx
        .select(pieceSelection)
        .from(psaAusruestungstuecke)
        .leftJoin(
          psaAusruestungstypen,
          eq(psaAusruestungstypen.id, psaAusruestungstuecke.ausruestungstypId),
        )
        .leftJoin(kameraden, eq(kameraden.id, psaAusruestungstuecke.kameradId))
        .where(eq(psaAusruestungstuecke.kameradId, session.kameradId))
        .orderBy(asc(psaAusruestungstuecke.seriennummer)),
    );
    const pieces = toPieceRows(rows);
    const faellig = pieces.filter(
      (p) => p.naechstePruefung && p.naechstePruefung <= cutoffStr,
    ).length;

    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Meine Ausrüstung</h1>
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
    withScope(scope, (tx) =>
      tx
        .select({ value: count() })
        .from(kameraden)
        .where(eq(kameraden.aktiv, true)),
    ),
    withScope(scope, (tx) =>
      tx.select({ value: count() }).from(psaAusruestungstuecke),
    ),
    withScope(scope, (tx) =>
      tx
        .select({ value: count() })
        .from(psaAusruestungstuecke)
        .where(eq(psaAusruestungstuecke.status, "Ausgegeben")),
    ),
    withScope(scope, (tx) =>
      tx
        .select({ value: count() })
        .from(psaAusruestungstuecke)
        .where(
          and(
            isNotNull(psaAusruestungstuecke.naechstePruefung),
            lte(psaAusruestungstuecke.naechstePruefung, cutoffStr),
          ),
        ),
    ),
  ]);

  // Nur, was die Größenübersicht und die Auswahllisten brauchen. Stammdaten
  // (E-Mail, Personalnummer, Karten-ID) pflegt die Mitgliederverwaltung.
  const kameradenRows = await withScope(scope, (tx) =>
    tx
      .select({
        id: kameraden.id,
        vorname: kameraden.vorname,
        name: kameraden.name,
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
      .orderBy(asc(kameraden.name), asc(kameraden.vorname)),
  );

  const pieceRows = await withScope(scope, (tx) =>
    tx
      .select(pieceSelection)
      .from(psaAusruestungstuecke)
      .leftJoin(
        psaAusruestungstypen,
        eq(psaAusruestungstypen.id, psaAusruestungstuecke.ausruestungstypId),
      )
      .leftJoin(kameraden, eq(kameraden.id, psaAusruestungstuecke.kameradId))
      .orderBy(asc(psaAusruestungstuecke.seriennummer)),
  );
  const pieces = toPieceRows(pieceRows);

  const kameradenOptions: KameradOption[] = kameradenRows
    .filter((k) => k.aktiv)
    .map((k) => ({ id: k.id, label: `${k.vorname} ${k.name}` }));

  // Namen verlinken auf /mitglieder/[id]. Diese Seite ist nur für PSA-Admin und
  // Kleiderwart, die Mitglieder sehen dürfen.
  const linkUser = { kamerad_id: session.kameradId, app_role: session.isGlobalAdmin ? "Admin" : "User", psa_rolle: session.psaRole };
  const groessenZeilen: GroessenZeile[] = kameradenRows.map((k) => ({
    ...k,
    link: mitgliedLinkZiel(linkUser, k.id),
  }));
  const mitgliedLinks: Record<number, string | null> = Object.fromEntries(
    kameradenRows.map((k) => [k.id, mitgliedLinkZiel(linkUser, k.id)]),
  );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">PSA-Verwaltung</h1>
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

      <section id="groessen" className="scroll-mt-20">
        <GroessenUebersicht zeilen={groessenZeilen} />
      </section>

      <section id="ausruestung" className="scroll-mt-20">
        <AusruestungManager
          pieces={pieces}
          typen={typen}
          kameraden={kameradenOptions}
          mitgliedLinks={mitgliedLinks}
          canEdit
        />
      </section>
    </main>
  );
}
