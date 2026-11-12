import { sql, type SQL } from "drizzle-orm";
import type { RegelEingabe } from "@/lib/dienstplan/eingabe";

const arr = (werte: (string | number)[] | null | undefined, typ: "text" | "smallint"): SQL =>
  werte == null ? sql`null` : sql`array[${sql.join(werte.map((w) => sql`${w}`), sql`, `)}]::${sql.raw(typ)}[]`;

/** Werte einer vollständigen Regel als SQL-Parameter (Arrays und Enum mit Cast). Felder, die nicht zum Typ gehören, werden geleert. */
export function regelSql(r: RegelEingabe) {
  const zyklus = r.typ === "wochen_zyklus";
  return {
    name: r.name,
    typ: sql`${r.typ}::dienstplan.regel_typ`,
    wochentag: r.wochentag,
    uhrzeit: r.uhrzeit,
    ankerDatum: zyklus ? r.ankerDatum ?? null : null,
    muster: zyklus ? arr(r.muster, "text") : sql`null`,
    nterWochentag: zyklus ? null : r.nterWochentag ?? null,
    monate: zyklus ? sql`null` : arr(r.monate, "smallint"),
    kategorieKuerzel: zyklus ? null : r.kategorieKuerzel ?? null,
    gueltigAb: r.gueltigAb,
    gueltigBis: r.gueltigBis ?? null,
    aktiv: r.aktiv ?? true,
  };
}
