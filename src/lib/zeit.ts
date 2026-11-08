// Datum und Uhrzeit in Berlin, unabhängig von der Zeitzone des Servers (UTC im Container).
// Ohne Datenbank- oder Server-Importe, damit auch Client-Komponenten sie nutzen können.
export const BERLIN = "Europe/Berlin";

export function today(): string {
  // sv-SE liefert das Format YYYY-MM-DD
  return new Intl.DateTimeFormat("sv-SE", { timeZone: BERLIN }).format(new Date());
}

export function nowHHMM(): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: BERLIN,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
}

// Zeitpunkt als "08.11.2026, 14:35" in Berlin (für Protokolle und Listen).
export function datumZeit(zeitpunkt: Date | string): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: BERLIN,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(zeitpunkt));
}

// Datum als "08.11.2026". Nimmt einen Date oder einen reinen Datumstext
// YYYY-MM-DD (dann ohne Zeitzonenumrechnung, sonst könnte der Tag verrutschen).
export function datumKurz(wert: Date | string | null | undefined): string {
  if (!wert) return "–";
  if (typeof wert === "string" && /^\d{4}-\d{2}-\d{2}$/.test(wert)) {
    const [j, m, t] = wert.split("-");
    return `${t}.${m}.${j}`;
  }
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: BERLIN,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(wert));
}

// Tage auf ein Datum YYYY-MM-DD addieren (negativ = zurück), ohne Zeitzoneneffekt.
export function addDays(datum: string, tage: number): string {
  const [j, m, t] = datum.split("-").map(Number);
  return new Date(Date.UTC(j, m - 1, t + tage)).toISOString().slice(0, 10);
}