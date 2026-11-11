// Dezente Markierung "geändert am TT.MM." (Spec 8): Termin weicht von der letzten
// Freigabe-Version ab. Berechnet auf dem Server (ladePlan → aenderungen), nicht
// gespeichert. Keine auffällige Farbe, nur graue Kleinschrift mit Punkt.
export function Geaendert({ aktualisiertAm }: { aktualisiertAm: string }) {
  const d = new Date(aktualisiertAm);
  const text = d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" });
  return (
    <span data-geaendert className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="Seit der letzten Freigabe geändert">
      <span aria-hidden className="size-1.5 rounded-full bg-muted-foreground" />geändert am {text}
    </span>
  );
}
