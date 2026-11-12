import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { druckfarbe } from "@/lib/dienstplan/druckfarben";
import { legende, titelText, type DruckKategorie, type DruckZeile } from "@/lib/dienstplan/druck";
import { ladeLogo, schriftPfad } from "@/lib/dienstplan/schrift";

// PDF (Spec 9.2): A4 hoch zum Ausdrucken, je Halbjahr eine Seite (bei Bedarf
// Umbruch, Tabellenkopf wiederholt). Kopf mit Logo-Symbol, Titel, Stand;
// Tabelle wie Excel, Kategoriefarbe als schmaler Streifen am Zeilenanfang
// (wenig Toner); Legende und Seitenzahl im Fuß. Inter eingebettet.

let registriert = false;
function schriften() {
  if (registriert) return;
  Font.register({
    family: "Inter",
    fonts: [
      { src: schriftPfad(400), fontWeight: 400 },
      { src: schriftPfad(600), fontWeight: 600 },
      { src: schriftPfad(700), fontWeight: 700 },
    ],
  });
  // Keine automatische Silbentrennung (Namen und Fachbegriffe)
  Font.registerHyphenationCallback((wort) => [wort]);
  registriert = true;
}

const DUNKEL = "#1C1C1E", GRAU = "#636366", LINIE = "#D1D1D6";
const s = StyleSheet.create({
  seite: { fontFamily: "Inter", fontSize: 9, color: DUNKEL, paddingTop: 36, paddingBottom: 56, paddingHorizontal: 36 },
  kopf: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  logo: { width: 40, height: 40, marginRight: 8 },
  titel: { fontSize: 16, fontWeight: 700 },
  unter: { fontSize: 9, color: GRAU, marginTop: 2 },
  zeileKopf: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: GRAU, paddingBottom: 3, marginBottom: 1, fontWeight: 600, fontSize: 8, color: GRAU },
  zeile: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: LINIE, paddingVertical: 3.5, alignItems: "flex-start" },
  streifen: { width: 3, alignSelf: "stretch", marginRight: 5, borderRadius: 1 },
  datum: { width: 58 }, tag: { width: 22 }, kuerzel: { width: 22, fontWeight: 600 }, zeit: { width: 32 },
  thema: { flex: 3, paddingRight: 6 }, verantwortlich: { flex: 2 },
  fuss: { position: "absolute", left: 36, right: 36, bottom: 24, flexDirection: "row", justifyContent: "space-between", alignItems: "center", fontSize: 7.5, color: GRAU },
  legende: { flexDirection: "row", flexWrap: "wrap", flex: 1 },
  legEintrag: { flexDirection: "row", alignItems: "center", marginRight: 10, marginBottom: 2 },
  legPunkt: { width: 6, height: 6, borderRadius: 3, marginRight: 3 },
});

function Tabelle({ zeilen }: { zeilen: DruckZeile[] }) {
  return (
    <View>
      <View style={s.zeileKopf} fixed>
        <View style={{ width: 8 }} />
        <Text style={s.datum}>Datum</Text><Text style={s.tag}>Tag</Text><Text style={s.kuerzel}>Art</Text>
        <Text style={s.zeit}>Uhrzeit</Text><Text style={s.thema}>Thema</Text><Text style={s.verantwortlich}>Verantwortlich</Text>
      </View>
      {zeilen.map((z) => (
        <View key={z.terminId} style={s.zeile} wrap={false}>
          <View style={[s.streifen, { backgroundColor: druckfarbe(z.farbe) }]} />
          <Text style={s.datum}>{z.datumLang}</Text>
          <Text style={s.tag}>{z.tag}</Text>
          <Text style={s.kuerzel}>{z.kuerzel}</Text>
          <Text style={s.zeit}>{z.uhrzeit}</Text>
          <Text style={[s.thema, z.ausgefallen ? { color: GRAU } : {}]}>{z.titel}</Text>
          <Text style={s.verantwortlich}>{z.verantwortliche}</Text>
        </View>
      ))}
      {zeilen.length === 0 && <Text style={{ paddingVertical: 12, color: GRAU }}>Keine Termine</Text>}
    </View>
  );
}

function Seite({ titel, zeilen, kategorien, stand, organisation, entwurf, logo }: {
  titel: string; zeilen: DruckZeile[]; kategorien: DruckKategorie[]; stand: string; organisation: string; entwurf: boolean; logo: Buffer;
}) {
  const leg = legende(zeilen, kategorien);
  return (
    <Page size="A4" orientation="portrait" style={s.seite}>
      <View style={s.kopf}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf-Image, kein HTML-img */}
        <Image style={s.logo} src={logo} />
        <View>
          <Text style={s.titel}>{titel}{entwurf ? " (Entwurf)" : ""}</Text>
          <Text style={s.unter}>{organisation} · {stand}</Text>
        </View>
      </View>
      <Tabelle zeilen={zeilen} />
      <View style={s.fuss} fixed>
        <View style={s.legende}>
          {leg.map((k) => (
            <View key={k.kuerzel} style={s.legEintrag}>
              <View style={[s.legPunkt, { backgroundColor: druckfarbe(k.farbe) }]} />
              <Text>{k.kuerzel} {k.name}</Text>
            </View>
          ))}
        </View>
        <Text render={({ pageNumber, totalPages }) => `Seite ${pageNumber} von ${totalPages}`} />
      </View>
    </Page>
  );
}

export async function dienstplanPdf(o: {
  jahr: number; halbjahr: 1 | 2 | null; zeilen: { h1: DruckZeile[]; h2: DruckZeile[] }; kategorien: DruckKategorie[];
  stand: string; organisation: string; entwurf: boolean;
}): Promise<Uint8Array> {
  schriften();
  const logo = await ladeLogo("rot");
  const teile: [1 | 2, DruckZeile[]][] = o.halbjahr === 1 ? [[1, o.zeilen.h1]] : o.halbjahr === 2 ? [[2, o.zeilen.h2]] : [[1, o.zeilen.h1], [2, o.zeilen.h2]];
  const doc = (
    <Document title={titelText(o.jahr, o.halbjahr)} author={o.organisation} creator="FW-Hub" producer="FW-Hub" language="de-DE">
      {teile.map(([h, z]) => (
        <Seite key={h} titel={titelText(o.jahr, h)} zeilen={z} kategorien={o.kategorien} stand={o.stand} organisation={o.organisation} entwurf={o.entwurf} logo={logo} />
      ))}
    </Document>
  );
  return new Uint8Array(await renderToBuffer(doc));
}
