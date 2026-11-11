import { ImageResponse } from "next/og";
import { druckfarbe, toenung } from "@/lib/dienstplan/druckfarben";
import { BILD, bildMasse, kuerze, legende, titelText, type DruckKategorie, type DruckZeile } from "@/lib/dienstplan/druck";
import { ladeSchriften } from "@/lib/dienstplan/schrift";

// Bild für das Smartphone (Spec 9.3): je Halbjahr ein PNG im Hochformat
// 1290 × 2796, oben 15 % und unten 10 % frei (Uhr und Widgets des
// Sperrbildschirms). Kompakt: Tag, Datum, Kürzel, Kurztitel, Verantwortliche
// umschaltbar. Hell und dunkel. Erzeugt mit next/og (satori + resvg, ohne
// Headless-Browser).

const THEMEN = {
  hell: { grund: "#F2F2F7", karte: "#FFFFFF", text: "#1C1C1E", leise: "#636366", linie: "#D1D1D6" },
  dunkel: { grund: "#000000", karte: "#1C1C1E", text: "#F2F2F7", leise: "#AEAEB2", linie: "#38383A" },
} as const;

export async function dienstplanBild(o: {
  jahr: number; halbjahr: 1 | 2; zeilen: DruckZeile[]; kategorien: DruckKategorie[]; stand: string;
  dunkel: boolean; mitNamen: boolean; entwurf: boolean;
}): Promise<Uint8Array> {
  const f = THEMEN[o.dunkel ? "dunkel" : "hell"];
  const m = bildMasse(o.zeilen.length, o.mitNamen);
  const schriften = await ladeSchriften();
  const zeichen = Math.floor((BILD.breite - 2 * 64 - 360) / (m.schrift * 0.55));
  const leg = legende(o.zeilen, o.kategorien);
  const tonung = (farbe: string) => (o.dunkel ? toenung(druckfarbe(farbe, true), 0.22, f.karte) : toenung(druckfarbe(farbe), 0.14, f.karte));

  const element = (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", backgroundColor: f.grund, color: f.text, fontFamily: "Inter",
      paddingTop: Math.round(BILD.hoehe * BILD.oben), paddingBottom: Math.round(BILD.hoehe * BILD.unten), paddingLeft: 64, paddingRight: 64 }}>
      <div style={{ display: "flex", flexDirection: "column", height: 150, justifyContent: "center" }}>
        <div style={{ display: "flex", fontSize: 64, fontWeight: 700 }}>{titelText(o.jahr, o.halbjahr)}{o.entwurf ? " (Entwurf)" : ""}</div>
        <div style={{ display: "flex", fontSize: 30, color: f.leise, marginTop: 6 }}>{o.stand}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
        {o.zeilen.map((z) => (
          <div key={z.terminId} style={{ display: "flex", alignItems: "center", height: m.zeile, borderBottom: `2px solid ${f.linie}`,
            backgroundColor: tonung(z.farbe), borderLeft: `10px solid ${druckfarbe(z.farbe, o.dunkel)}`, paddingLeft: 18, paddingRight: 18,
            opacity: z.ausgefallen ? 0.55 : 1 }}>
            <div style={{ display: "flex", width: 76, fontSize: m.schrift, color: f.leise }}>{z.tag}</div>
            <div style={{ display: "flex", width: 150, fontSize: m.schrift, fontWeight: 600 }}>{z.datumKurz}</div>
            <div style={{ display: "flex", width: 64, fontSize: m.klein, fontWeight: 700 }}>{z.kuerzel}</div>
            <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, overflow: "hidden" }}>
              <div style={{ display: "flex", fontSize: m.schrift, fontWeight: 600 }}>{kuerze(z.kurz, zeichen)}</div>
              {o.mitNamen && z.verantwortliche && (
                <div style={{ display: "flex", fontSize: m.klein, color: f.leise }}>{kuerze(z.verantwortliche, Math.floor(zeichen * 1.35))}</div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", height: 70, alignItems: "flex-end", fontSize: 24, color: f.leise }}>
        {leg.map((k) => (
          <div key={k.kuerzel} style={{ display: "flex", alignItems: "center", marginRight: 26 }}>
            <div style={{ display: "flex", width: 18, height: 18, borderRadius: 9, backgroundColor: druckfarbe(k.farbe, o.dunkel), marginRight: 8 }} />
            {k.kuerzel} {k.name}
          </div>
        ))}
      </div>
    </div>
  );
  const antwort = new ImageResponse(element, {
    width: BILD.breite,
    height: BILD.hoehe,
    fonts: schriften.map((s) => ({ name: "Inter", data: s.daten.buffer.slice(s.daten.byteOffset, s.daten.byteOffset + s.daten.byteLength) as ArrayBuffer, weight: s.gewicht, style: "normal" as const })),
  });
  return new Uint8Array(await antwort.arrayBuffer());
}
