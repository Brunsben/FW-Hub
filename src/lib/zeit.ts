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

// Tage auf ein Datum YYYY-MM-DD addieren (negativ = zurück), ohne Zeitzoneneffekt.
export function addDays(datum: string, tage: number): string {
  const [j, m, t] = datum.split("-").map(Number);
  return new Date(Date.UTC(j, m - 1, t + tage)).toISOString().slice(0, 10);
}