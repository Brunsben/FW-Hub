// Klassen je Kategoriefarbe (Spec 7.1). Tailwind erzeugt nur Klassen, die
// wörtlich im Code stehen, darum die vollständige Tabelle. Werte kommen aus den
// Tokens --dp-* in globals.css (hell/dunkel), nie als Hex.
export const KATEGORIE_KLASSEN: Record<string, { streifen: string; flaeche: string; punkt: string }> = {
  blue: { streifen: "border-l-dp-blue", flaeche: "bg-dp-blue/12", punkt: "bg-dp-blue" },
  teal: { streifen: "border-l-dp-teal", flaeche: "bg-dp-teal/12", punkt: "bg-dp-teal" },
  orange: { streifen: "border-l-dp-orange", flaeche: "bg-dp-orange/12", punkt: "bg-dp-orange" },
  indigo: { streifen: "border-l-dp-indigo", flaeche: "bg-dp-indigo/12", punkt: "bg-dp-indigo" },
  pink: { streifen: "border-l-dp-pink", flaeche: "bg-dp-pink/12", punkt: "bg-dp-pink" },
  purple: { streifen: "border-l-dp-purple", flaeche: "bg-dp-purple/12", punkt: "bg-dp-purple" },
  red: { streifen: "border-l-dp-red", flaeche: "bg-dp-red/12", punkt: "bg-dp-red" },
  yellow: { streifen: "border-l-dp-yellow", flaeche: "bg-dp-yellow/12", punkt: "bg-dp-yellow" },
  green: { streifen: "border-l-dp-green", flaeche: "bg-dp-green/12", punkt: "bg-dp-green" },
  gray: { streifen: "border-l-dp-gray", flaeche: "bg-dp-gray/12", punkt: "bg-dp-gray" },
};

export const klassenFuer = (farbe: string | undefined, ausgefallen = false) =>
  KATEGORIE_KLASSEN[ausgefallen ? "gray" : farbe ?? "gray"] ?? KATEGORIE_KLASSEN.gray;

const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/** "Di 06.01." aus "2027-01-06" (ohne Zeitzonen-Rechnung). */
export function datumKurz(datum: string): string {
  const [j, m, t] = datum.split("-").map(Number);
  const wt = (new Date(Date.UTC(j, m - 1, t)).getUTCDay() + 6) % 7;
  return `${WOCHENTAGE[wt]} ${String(t).padStart(2, "0")}.${String(m).padStart(2, "0")}.`;
}

export const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
