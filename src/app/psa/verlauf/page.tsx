import { redirect } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  psaAusruestungstuecke,
  psaAusruestungstypen,
  psaPruefungen,
  psaSchadensdokumentation,
  psaWaesche,
} from "@/lib/db/schema";
import { requirePsaSession } from "@/lib/psa-auth";
import {
  VerlaufBrowser,
  type PieceOption,
  type PruefungRow,
  type SchadenRow,
  type WaescheRow,
} from "@/components/psa/verlauf-browser";

function label(typName: string | null, seriennummer: string | null): string {
  return `${typName ?? "?"} (${seriennummer ?? "—"})`;
}

export default async function PsaVerlaufPage() {
  const session = await requirePsaSession();
  if (!session) redirect("/login");
  const onlyOwn = session.isUser;

  const pruefRows = await db
    .select({
      id: psaPruefungen.id,
      datum: psaPruefungen.datum,
      ergebnis: psaPruefungen.ergebnis,
      pruefer: psaPruefungen.pruefer,
      naechstePruefung: psaPruefungen.naechstePruefung,
      notizen: psaPruefungen.notizen,
      foto: psaPruefungen.foto,
      seriennummer: psaAusruestungstuecke.seriennummer,
      typName: psaAusruestungstypen.bezeichnung,
    })
    .from(psaPruefungen)
    .leftJoin(
      psaAusruestungstuecke,
      eq(psaAusruestungstuecke.id, psaPruefungen.ausruestungstueckId),
    )
    .leftJoin(
      psaAusruestungstypen,
      eq(psaAusruestungstypen.id, psaAusruestungstuecke.ausruestungstypId),
    )
    .where(onlyOwn ? eq(psaPruefungen.kameradId, session.kameradId) : undefined)
    .orderBy(desc(psaPruefungen.datum));
  const pruefungen: PruefungRow[] = pruefRows.map((r) => ({
    id: r.id,
    datum: r.datum,
    ergebnis: r.ergebnis,
    pruefer: r.pruefer,
    naechstePruefung: r.naechstePruefung,
    notizen: r.notizen,
    foto: r.foto,
    stueckLabel: label(r.typName, r.seriennummer),
  }));

  const wRows = await db
    .select({
      id: psaWaesche.id,
      datum: psaWaesche.datum,
      waescheart: psaWaesche.waescheart,
      notizen: psaWaesche.notizen,
      seriennummer: psaAusruestungstuecke.seriennummer,
      typName: psaAusruestungstypen.bezeichnung,
    })
    .from(psaWaesche)
    .leftJoin(
      psaAusruestungstuecke,
      eq(psaAusruestungstuecke.id, psaWaesche.ausruestungstueckId),
    )
    .leftJoin(
      psaAusruestungstypen,
      eq(psaAusruestungstypen.id, psaAusruestungstuecke.ausruestungstypId),
    )
    .where(onlyOwn ? eq(psaWaesche.kameradId, session.kameradId) : undefined)
    .orderBy(desc(psaWaesche.datum));
  const waesche: WaescheRow[] = wRows.map((r) => ({
    id: r.id,
    datum: r.datum,
    waescheart: r.waescheart,
    notizen: r.notizen,
    stueckLabel: label(r.typName, r.seriennummer),
  }));

  const sRows = await db
    .select({
      id: psaSchadensdokumentation.id,
      datum: psaSchadensdokumentation.datum,
      beschreibung: psaSchadensdokumentation.beschreibung,
      foto: psaSchadensdokumentation.foto,
      seriennummer: psaAusruestungstuecke.seriennummer,
      typName: psaAusruestungstypen.bezeichnung,
      kameradId: psaAusruestungstuecke.kameradId,
    })
    .from(psaSchadensdokumentation)
    .leftJoin(
      psaAusruestungstuecke,
      eq(psaAusruestungstuecke.id, psaSchadensdokumentation.ausruestungstueckId),
    )
    .leftJoin(
      psaAusruestungstypen,
      eq(psaAusruestungstypen.id, psaAusruestungstuecke.ausruestungstypId),
    )
    .where(
      onlyOwn
        ? eq(psaAusruestungstuecke.kameradId, session.kameradId)
        : undefined,
    )
    .orderBy(desc(psaSchadensdokumentation.datum));
  const schaeden: SchadenRow[] = sRows.map((r) => ({
    id: r.id,
    datum: r.datum,
    beschreibung: r.beschreibung,
    foto: r.foto,
    stueckLabel: label(r.typName, r.seriennummer),
  }));

  const pieceRows = await db
    .select({
      id: psaAusruestungstuecke.id,
      seriennummer: psaAusruestungstuecke.seriennummer,
      typName: psaAusruestungstypen.bezeichnung,
    })
    .from(psaAusruestungstuecke)
    .leftJoin(
      psaAusruestungstypen,
      eq(psaAusruestungstypen.id, psaAusruestungstuecke.ausruestungstypId),
    )
    .where(
      onlyOwn
        ? eq(psaAusruestungstuecke.kameradId, session.kameradId)
        : undefined,
    )
    .orderBy(asc(psaAusruestungstuecke.seriennummer));
  const pieces: PieceOption[] = pieceRows.map((p) => ({
    id: p.id,
    label: label(p.typName, p.seriennummer),
  }));

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Verlauf</h1>
        <p className="text-sm text-muted-foreground">
          Angemeldet als {session.kameradName} ({session.psaRole})
        </p>
      </div>
      <VerlaufBrowser
        pruefungen={pruefungen}
        waesche={waesche}
        schaeden={schaeden}
        pieces={pieces}
        canEdit={session.canEdit}
      />
    </main>
  );
}
