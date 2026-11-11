import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { withGlobalAdminScope } from "@/lib/db/scoped";
import { kameraden } from "@/lib/db/schema";
import { kameradenStammdaten } from "@/lib/db/kameraden-stamm";
import { expectRows } from "@/lib/db/rows";
import { requireGlobalAdmin } from "@/lib/benutzer-admin";
import { constraintName, PG_UNIQUE_VIOLATION, pgErrorCode } from "@/lib/db/pg-error";
import {
  abgleichen, dekodiere, istUebernehmbar, MAX_DATEI_BYTES, parseKameradenCsv, type AbgleichZeile,
} from "@/lib/mitglieder/csv-import";

class ImportFehler extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

// CSV-Import von Kameraden (nur globaler Admin). Zwei Schritte mit derselben
// Datei, die Vorschau wird jedes Mal auf dem Server neu berechnet (der Client
// schickt nie Personendaten zum Anlegen, nur die Datei und Zeilennummern):
//   POST { datei: <Base64> }                      → Vorschau (nichts geschrieben)
//   POST { datei: <Base64>, uebernehmen: [zeile] } → anlegen bzw. ergänzen
// Ergänzen füllt nur leere Felder (Personalnummer, Spitzname) bestehender
// Kameraden. Alles in EINER Transaktion; das Änderungsprotokoll schreibt der
// Trigger auf core.kameraden. Kameraden werden nie gelöscht oder überschrieben.
export async function POST(req: NextRequest) {
  const guard = await requireGlobalAdmin();
  if (!guard.ok) return guard.response;

  let body: Record<string, unknown>;
  try {
    const b: unknown = await req.json();
    if (!b || typeof b !== "object" || Array.isArray(b)) throw new Error();
    body = b as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Ungültiger Body" }, { status: 400 });
  }
  if (typeof body.datei !== "string" || body.datei === "") {
    return NextResponse.json({ error: "Datei fehlt" }, { status: 400 });
  }
  const bytes = Buffer.from(body.datei, "base64");
  if (bytes.length === 0) return NextResponse.json({ error: "Datei ist leer" }, { status: 400 });
  if (bytes.length > MAX_DATEI_BYTES) {
    return NextResponse.json({ error: "Datei zu groß (höchstens 512 KB)" }, { status: 400 });
  }
  let auswahl: Set<number> | null = null;
  if (body.uebernehmen !== undefined) {
    if (!Array.isArray(body.uebernehmen) || !body.uebernehmen.every((z) => Number.isInteger(z) && z > 0)) {
      return NextResponse.json({ error: "uebernehmen muss eine Liste von Zeilennummern sein" }, { status: 400 });
    }
    if (body.uebernehmen.length === 0) return NextResponse.json({ error: "Keine Zeile ausgewählt" }, { status: 400 });
    auswahl = new Set(body.uebernehmen as number[]);
  }

  const gelesen = parseKameradenCsv(dekodiere(new Uint8Array(bytes)));
  if (!("format" in gelesen)) return NextResponse.json({ error: gelesen.fehler }, { status: 400 });

  try {
    const ergebnis = await withGlobalAdminScope(guard.user, async (tx) => {
      const vorhandene = await tx
        .select({
          id: kameraden.id, name: kameraden.name, vorname: kameraden.vorname,
          personalnummer: kameraden.personalnummer, spitzname: kameraden.spitzname, aktiv: kameraden.aktiv,
        })
        .from(kameraden);
      const zeilen = abgleichen(gelesen.zeilen, vorhandene);
      if (!auswahl) return { zeilen, angelegt: 0, ergaenzt: 0 };

      const gewaehlt: AbgleichZeile[] = [];
      for (const nr of auswahl) {
        const z = zeilen.find((x) => x.zeile === nr);
        if (!z) throw new ImportFehler(400, `Zeile ${nr} enthält keine Person`);
        if (!istUebernehmbar(z)) {
          throw new ImportFehler(409, `Zeile ${nr} kann nicht übernommen werden (${z.hinweis ?? z.status}). Vorschau bitte neu laden.`);
        }
        gewaehlt.push(z);
      }
      let angelegt = 0;
      let ergaenzt = 0;
      for (const z of gewaehlt.sort((a, b) => a.zeile - b.zeile)) {
        if (z.status === "ergaenzen" && z.kameradId) {
          const werte: { personalnummer?: string; spitzname?: string; updatedAt: Date } = { updatedAt: new Date() };
          if (z.ergaenzt.includes("personalnummer") && z.personalnummer) werte.personalnummer = z.personalnummer;
          if (z.ergaenzt.includes("spitzname") && z.spitzname) werte.spitzname = z.spitzname;
          expectRows(
            await tx.update(kameraden).set(werte).where(eq(kameraden.id, z.kameradId)).returning({ id: kameraden.id }),
            `Kamerad aus Zeile ${z.zeile}`,
          );
          ergaenzt++;
        } else {
          await tx.insert(kameradenStammdaten).values({
            name: z.nachname,
            vorname: z.vorname,
            personalnummer: z.personalnummer,
            spitzname: z.spitzname,
            spitznameAnzeigen: false,
            aktiv: true,
          });
          angelegt++;
        }
      }
      return { zeilen: [] as AbgleichZeile[], angelegt, ergaenzt };
    });
    return NextResponse.json({
      format: gelesen.format,
      fehler: gelesen.fehler,
      zeilen: ergebnis.zeilen,
      angelegt: ergebnis.angelegt,
      ergaenzt: ergebnis.ergaenzt,
    });
  } catch (e) {
    if (e instanceof ImportFehler) return NextResponse.json({ error: e.message }, { status: e.status });
    if (pgErrorCode(e) === PG_UNIQUE_VIOLATION) {
      const text = (constraintName(e) ?? "").includes("personalnummer")
        ? "Eine Personalnummer ist inzwischen vergeben. Nichts übernommen, Vorschau bitte neu laden."
        : "Eintrag existiert bereits. Nichts übernommen.";
      return NextResponse.json({ error: text }, { status: 409 });
    }
    throw e;
  }
}
