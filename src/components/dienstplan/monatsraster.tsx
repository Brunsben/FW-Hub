"use client";

import { cn } from "@/lib/utils";
import type { DpTermin } from "@/lib/dienstplan/hinweise";
import type { DpKategorie } from "@/lib/dienstplan/plan";
import { klassenFuer, MONATE } from "@/components/dienstplan/farben";
import { useZiehbar, useZiel } from "@/components/dienstplan/dnd";

// Monatsraster der Eingabemaske (Spec 7.2): je Monat ein Kalender Mo–So.
// Terminkarte auf einen anderen Tag ziehen = Datum ändern. Klick wählt den
// Termin (Bearbeitung in der Karte über dem Raster und in der Seitenleiste).

const TAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const iso = (j: number, m: number, t: number) => `${j}-${String(m + 1).padStart(2, "0")}-${String(t).padStart(2, "0")}`;

export function Monatsraster({ jahr, termine, kategorien, terminId, waehle, busy }: {
  jahr: number; termine: DpTermin[]; kategorien: Map<number, DpKategorie>; terminId: number | null;
  waehle: (id: number) => void; busy: boolean;
}) {
  const proTag = new Map<string, DpTermin[]>();
  for (const t of termine) proTag.set(t.datum, [...(proTag.get(t.datum) ?? []), t]);
  return (
    <div className="grid gap-6">
      <p className="text-sm text-muted-foreground">Termin auf einen anderen Tag ziehen, um das Datum zu ändern. Klick wählt den Termin.</p>
      {MONATE.map((name, m) => {
        const tage = new Date(Date.UTC(jahr, m + 1, 0)).getUTCDate();
        const versatz = (new Date(Date.UTC(jahr, m, 1)).getUTCDay() + 6) % 7;
        return (
          <section key={m} aria-labelledby={`raster-${m}`} className="grid gap-1">
            <h2 id={`raster-${m}`} className="text-lg font-semibold tracking-tight">{name}</h2>
            <div className="grid grid-cols-7 gap-1 text-xs text-muted-foreground">
              {TAGE.map((t) => <div key={t} className="px-1">{t}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: versatz }, (_, i) => <div key={`l${i}`} />)}
              {Array.from({ length: tage }, (_, i) => {
                const d = iso(jahr, m, i + 1);
                return <TagZelle key={d} datum={d} tag={i + 1} termine={proTag.get(d) ?? []} kategorien={kategorien} terminId={terminId} waehle={waehle} busy={busy} />;
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function TagZelle({ datum, tag, termine, kategorien, terminId, waehle, busy }: {
  datum: string; tag: number; termine: DpTermin[]; kategorien: Map<number, DpKategorie>; terminId: number | null;
  waehle: (id: number) => void; busy: boolean;
}) {
  const { knoten, ueber } = useZiel(`tag-${datum}`, { ziel: "tag", datum });
  return (
    <div ref={knoten} data-tag={datum} className={cn("flex min-h-16 min-w-0 flex-col gap-0.5 rounded-md border border-border p-1", ueber && "border-primary bg-primary/10")}>
      <span className="text-xs tabular-nums text-muted-foreground">{tag}</span>
      {termine.map((t) => <Chip key={t.id} t={t} kategorie={kategorien.get(t.kategorieId)} gewaehlt={t.id === terminId} waehle={waehle} busy={busy} />)}
    </div>
  );
}

function Chip({ t, kategorie, gewaehlt, waehle, busy }: { t: DpTermin; kategorie?: DpKategorie; gewaehlt: boolean; waehle: (id: number) => void; busy: boolean }) {
  const k = klassenFuer(kategorie?.farbe, t.ausgefallen);
  const titel = t.themen.map((p) => p.titel).join(", ");
  const { knoten, onPointerDown, zieht } = useZiehbar(`termin-${t.id}`, { art: "termin", id: t.id, titel: `${t.kuerzel} ${titel}`.trim() }, busy);
  return (
    <button
      ref={knoten}
      type="button"
      onPointerDown={onPointerDown}
      onClick={() => waehle(t.id)}
      aria-pressed={gewaehlt}
      data-raster-termin={t.id}
      title={titel || kategorie?.name}
      className={cn("truncate rounded border-l-4 px-1 text-left text-xs", k.streifen, k.flaeche, t.ausgefallen && "line-through", gewaehlt && "ring-2 ring-ring", zieht && "opacity-40")}
    >
      <span className="font-semibold">{t.kuerzel}</span> {titel}
    </button>
  );
}
