import { sql } from "drizzle-orm";
import type { ScopedTx } from "@/lib/db/scoped";
import { expectRows } from "@/lib/db/rows";
import { DpFehler } from "@/lib/dienstplan/route";
import { ladeKategorien, ladeTermine, type DpPlan } from "@/lib/dienstplan/plan";
import { exportTermine, type ExportProfil, type ExportTermin, type Stand } from "@/lib/dienstplan/export";

// Datenbankseite der Exporte (Phase 10). Läuft im Dienstplan-Scope (RLS).

export async function ladeExportTermine(tx: ScopedTx, plan: Pick<DpPlan, "id" | "jahr">, organisationId: number): Promise<ExportTermin[]> {
  const [termine, kategorien] = await Promise.all([ladeTermine(tx, plan), ladeKategorien(tx, organisationId)]);
  return exportTermine(termine, kategorien);
}

const PROFIL_SPALTEN = sql`id, name, trennzeichen, kodierung, kopfzeile, spalten, nur_freigegeben as "nurFreigegeben", kategorien`;

export async function listeProfile(tx: ScopedTx, organisationId: number): Promise<ExportProfil[]> {
  return [...await tx.execute<ExportProfil>(sql`
    select ${PROFIL_SPALTEN} from dienstplan.export_profile where organisation_id = ${organisationId} order by name, id`)];
}

export async function ladeProfil(tx: ScopedTx, organisationId: number, id: number): Promise<ExportProfil> {
  const [p] = await tx.execute<ExportProfil>(sql`
    select ${PROFIL_SPALTEN} from dienstplan.export_profile where organisation_id = ${organisationId} and id = ${id}`);
  if (!p) throw new DpFehler(404, "Exportprofil nicht gefunden");
  return p;
}

export type Lauf = { id: number; format: "csv" | "ics"; profilId: number | null; modus: string; erstelltAm: string; erstelltVon: number; anzahl: number };

/** Letzter Lauf für Plan + Format (+ Profil), Grundlage für "nur Änderungen". */
export async function letzterLauf(tx: ScopedTx, planId: number, format: "csv" | "ics", profilId: number | null): Promise<{ stand: Stand; erstelltAm: string } | null> {
  const [l] = await tx.execute<{ stand: Stand; erstelltAm: string }>(sql`
    select stand, to_char(erstellt_am at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "erstelltAm"
      from dienstplan.export_laeufe
     where plan_id = ${planId} and format = ${format}
       and ${profilId === null ? sql`profil_id is null` : sql`profil_id = ${profilId}`}
     order by erstellt_am desc, id desc limit 1`);
  return l ?? null;
}

export async function protokolliere(
  tx: ScopedTx, planId: number, format: "csv" | "ics", profilId: number | null, modus: "komplett" | "aenderungen", stand: Stand, kameradId: number,
): Promise<void> {
  expectRows(await tx.execute(sql`
    insert into dienstplan.export_laeufe (plan_id, profil_id, format, modus, stand, erstellt_von)
    values (${planId}, ${profilId}, ${format}, ${modus}, ${JSON.stringify(stand)}::jsonb, ${kameradId}) returning id`), "Exportlauf");
}

export async function listeLaeufe(tx: ScopedTx, planId: number): Promise<Lauf[]> {
  return [...await tx.execute<Lauf>(sql`
    select id, format, profil_id as "profilId", modus,
           to_char(erstellt_am at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "erstelltAm",
           erstellt_von as "erstelltVon", (select count(*)::int from jsonb_object_keys(stand)) as anzahl
      from dienstplan.export_laeufe where plan_id = ${planId} order by erstellt_am desc, id desc limit 50`)];
}

/** Halbjahr aus Body/Query: 1, 2 oder null (ganzes Jahr). */
export function leseHalbjahr(v: unknown): 1 | 2 | null {
  if (v === undefined || v === null || v === "" || v === "jahr") return null;
  if (v === 1 || v === "1") return 1;
  if (v === 2 || v === "2") return 2;
  throw new DpFehler(400, "halbjahr muss 1, 2 oder leer sein");
}

export function leseModus(v: unknown): "komplett" | "aenderungen" {
  if (v === undefined || v === "komplett") return "komplett";
  if (v === "aenderungen") return "aenderungen";
  throw new DpFehler(400, "modus muss komplett oder aenderungen sein");
}

export function leseKuerzel(v: unknown): string[] | null {
  if (v === undefined || v === null || v === "") return null;
  const liste = Array.isArray(v) ? v : String(v).split(",");
  if (!liste.every((k) => typeof k === "string" && /^[A-Za-z0-9]{1,5}$/.test(k.trim()))) throw new DpFehler(400, "kategorien: Kürzel mit Komma getrennt");
  const k = liste.map((x) => String(x).trim().toUpperCase()).filter(Boolean);
  return k.length ? k : null;
}

/** Antwort mit Datei als Base64 (der Client lädt sie herunter) und Zusatzinfos. */
export function dateiAntwort(dateiname: string, mime: string, bytes: Uint8Array, extra: Record<string, unknown> = {}) {
  return { dateiname, mime, inhalt: Buffer.from(bytes).toString("base64"), ...extra };
}
