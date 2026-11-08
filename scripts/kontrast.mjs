// WCAG-Kontrastprüfung der Theme-Tokens aus src/app/globals.css (nur Berechnung).
// Liest :root und .dark aus der Datei und prüft die genutzten Paare in beiden Themes.
import { readFileSync } from "node:fs";

// Aufruf: node scripts/kontrast.mjs   (Exit 1, wenn ein Paar seine Schwelle verfehlt)
// Schwellen: Text 4,5:1 (WCAG AA), Bedienelemente (Eingaberand, Fokusring, Primär-Fläche) 3:1.
const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const block = (sel) => {
  const m = css.match(new RegExp(`(?:^|\\n)${sel.replace(".", "\\.")}\\s*\\{([\\s\\S]*?)\\n\\}`));
  const o = {};
  for (const [, k, v] of (m?.[1] || "").matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) o[k] = v;
  return o;
};
const themes = { Hell: block(":root"), Dunkel: { ...block(":root"), ...block(".dark") } };

const lum = (h) => {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const mix = (fg, bg, a) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(fg.slice(i, i + 2), 16) * a + parseInt(bg.slice(i, i + 2), 16) * (1 - a)).toString(16).padStart(2, "0")).join("");

// [Name, Vordergrund-Token, Hintergrund-Token oder {mix:[token, ueber, alpha]}]
const paare = [
  ["Text auf Hintergrund", "foreground", "background"],
  ["Text auf Karte", "card-foreground", "card"],
  ["Gedämpfter Text auf Hintergrund", "muted-foreground", "background"],
  ["Gedämpfter Text auf Karte", "muted-foreground", "card"],
  ["Gedämpfter Text auf muted", "muted-foreground", "muted"],
  ["Gedämpfter Text auf accent (Hover)", "muted-foreground", "accent"],
  ["Primär-Knopf (Text/Fläche)", "primary-foreground", "primary"],
  ["Primär als Linktext auf Hintergrund", "primary", "background"],
  ["Secondary-Knopf", "secondary-foreground", "secondary"],
  ["Accent-Hover", "accent-foreground", "accent"],
  ["Destructive-Knopf (Text/Fläche)", "destructive-foreground", "destructive"],
  ["Fehlertext auf Hintergrund", "destructive", "background"],
  ["Fehlertext auf Karte", "destructive", "card"],
  ["Erfolg-Knopf/Toast (Text/Fläche)", "success-foreground", "success"],
  ["Erfolgstext auf Hintergrund", "success", "background"],
  ["Erfolgstext auf Karte", "success", "card"],
  ["Warnung-Text auf getönter Fläche (Text=foreground)", "foreground", { mix: ["warning", "background", 0.1] }],
  ["Erfolg-Kasten (Text=foreground)", "foreground", { mix: ["success", "background", 0.1] }],
];

const UI = [
  ["UI: Eingabefeld-Rand gegen Hintergrund (3:1)", "input", "background", 3],
  ["UI: Eingabefeld-Rand gegen Karte (3:1)", "input", "card", 3],
  ["UI: Fokusring gegen Hintergrund (3:1)", "ring", "background", 3],
  ["UI: Fokusring gegen Karte (3:1)", "ring", "card", 3],
  ["UI: Primär-Fläche gegen Hintergrund (3:1)", "primary", "background", 3],
  ["UI: Primär-Fläche gegen Karte (3:1)", "primary", "card", 3],
];
paare.push(...UI);
let fehler = 0;
console.log("Paar".padEnd(52), "Hell".padEnd(8), "Dunkel");
for (const [name, fg, bg, min = 4.5] of paare) {
  const zeile = [];
  for (const [t, tok] of Object.entries(themes)) {
    const f = tok[fg];
    const b = typeof bg === "string" ? tok[bg] : (tok[bg.mix[0]] && tok[bg.mix[1]] ? mix(tok[bg.mix[0]], tok[bg.mix[1]], bg.mix[2]) : undefined);
    if (!f || !b) { zeile.push("?"); fehler++; continue; }
    const r = ratio(f, b);
    if (r < min) fehler++;
    zeile.push(`${r.toFixed(2)}${r < min ? " ✗" : "  "}`);
  }
  console.log(name.padEnd(52), zeile[0].padEnd(8), zeile[1]);
}
console.log(fehler ? `\n${fehler} Paar(e) unter ihrer Schwelle oder Token fehlt` : "\nAlle Paare erfüllen ihre Schwelle (Text 4,5:1, Bedienelemente 3:1)");
process.exit(fehler ? 1 : 0);
