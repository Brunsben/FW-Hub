import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Inter (SIL OFL, public/fonts/Inter-OFL.txt), Spec 7.1: für PDF und Bild
// eingebettet. Die WOFF-Dateien liegen in public/fonts; im Standalone-Image ist
// public unter dem Arbeitsverzeichnis (/app/public) vorhanden.
export const SCHRIFT_GEWICHTE = [400, 600, 700] as const;
export type Gewicht = (typeof SCHRIFT_GEWICHTE)[number];

export const schriftPfad = (g: Gewicht) => join(process.cwd(), "public", "fonts", `inter-latin-${g}-normal.woff`);

let cache: Promise<{ gewicht: Gewicht; daten: Buffer }[]> | null = null;
export function ladeSchriften() {
  cache ??= Promise.all(SCHRIFT_GEWICHTE.map(async (gewicht) => ({ gewicht, daten: await readFile(schriftPfad(gewicht)) })));
  return cache;
}
