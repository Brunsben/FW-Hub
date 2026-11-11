// Kategoriefarben für Dateien (Excel, PDF, Bild), Spec 7.1. Die Oberfläche
// nutzt die Tokens --dp-<farbe> aus globals.css; Dateien brauchen feste Werte,
// darum hier die Hell- und Dunkelwerte aus der Spec. Nicht in Komponenten verwenden.
export const DRUCKFARBEN: Record<string, { hell: string; dunkel: string }> = {
  blue: { hell: "#007AFF", dunkel: "#0A84FF" },
  teal: { hell: "#30B0C7", dunkel: "#40C8E0" },
  orange: { hell: "#FF9500", dunkel: "#FF9F0A" },
  indigo: { hell: "#5856D6", dunkel: "#5E5CE6" },
  pink: { hell: "#FF2D55", dunkel: "#FF375F" },
  purple: { hell: "#AF52DE", dunkel: "#BF5AF2" },
  red: { hell: "#FF3B30", dunkel: "#FF453A" },
  yellow: { hell: "#FFCC00", dunkel: "#FFD60A" },
  green: { hell: "#34C759", dunkel: "#30D158" },
  gray: { hell: "#8E8E93", dunkel: "#8E8E93" },
};

export const druckfarbe = (farbe: string | undefined, dunkel = false) =>
  (DRUCKFARBEN[farbe ?? ""] ?? DRUCKFARBEN.gray)[dunkel ? "dunkel" : "hell"];

/** Mischung einer Farbe mit Weiß (anteil 0–1 Farbe), als "#RRGGBB". */
export function toenung(hex: string, anteil: number, grund = "#FFFFFF"): string {
  const a = hex.replace("#", ""), b = grund.replace("#", "");
  const k = (s: string, i: number) => parseInt(s.slice(i, i + 2), 16);
  const m = (i: number) => Math.round(k(a, i) * anteil + k(b, i) * (1 - anteil)).toString(16).padStart(2, "0");
  return `#${m(0)}${m(2)}${m(4)}`.toUpperCase();
}

export const WOCHENTAGE_KURZ = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
export const wochentagVon = (datum: string) => {
  const [j, m, t] = datum.split("-").map(Number);
  return WOCHENTAGE_KURZ[new Date(Date.UTC(j, m - 1, t)).getUTCDay()];
};
export const datumDe = (datum: string) => `${datum.slice(8, 10)}.${datum.slice(5, 7)}.${datum.slice(0, 4)}`;
