// Anzeigename einer Person für enge Darstellungen (Dienstplan, Exporte, Bilder).
// Modulübergreifend: PSA, Küche, Funk und Dienstplan nutzen dieselbe Logik.
// Reine Funktionen ohne Abhängigkeiten (scripts/test-anzeigename.mjs testet sie
// direkt). Spec: docs/dienstplan/DIENSTPLAN_SPEC.md, Abschnitt 4.2.
//
// Regel, angewendet auf die aktiven Kameraden (Vergleichsmenge `kontext`):
// 1. spitznameAnzeigen und Spitzname vorhanden: Spitzname ("HGL").
// 2. Sonst Nachname, wenn er eindeutig ist ("Krämer").
// 3. Sonst "Nachname, " plus kürzestes eindeutiges Vornamen-Präfix mit Punkt
//    ("Esters, Mar." / "Esters, Man.", "Heilemann, I." / "Heilemann, T.").
// 4. Gleicher Nach- und Vorname: keine automatische Unterscheidung möglich.
//    Ergebnis "Nachname, Vorname" mit mehrdeutig = true; die
//    Mitgliederverwaltung zeigt dann den Hinweis, einen Spitznamen zu vergeben.
//
// Vergleiche ignorieren Groß-/Kleinschreibung und überzählige Leerzeichen.
// Personen, die mit Spitzname angezeigt werden, zählen bei Regel 2 und 3 nicht
// als Konkurrenz: Ihr Anzeigename kollidiert nicht. So löst ein Spitzname für
// eine der beiden Personen mit gleichem Namen den Fall für beide.
// Inaktive Kameraden im Kontext werden ignoriert. Die Person selbst bekommt
// auch dann einen Namen, wenn sie inaktiv ist (z. B. in alten Plänen); sie wird
// gegen die aktiven Personen verglichen.

export interface AnzeigeKamerad {
  id: number;
  vorname: string;
  name: string;
  spitzname?: string | null;
  spitznameAnzeigen?: boolean | null;
  /** Fehlt der Wert, gilt die Person als aktiv. */
  aktiv?: boolean | null;
}

export interface Anzeigename {
  text: string;
  /** Regel 4: Name und Vorname sind nicht unterscheidbar (Spitzname vergeben). */
  mehrdeutig: boolean;
}

export interface AnzeigeExtern {
  name?: string | null;
  organisation?: string | null;
}

const sauber = (s: string | null | undefined) => (s ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
const schluessel = (s: string | null | undefined) => sauber(s).toLocaleLowerCase("de-DE");
const BUCHSTABE = /\p{L}/u;

function zeigtSpitzname(k: AnzeigeKamerad): boolean {
  return k.spitznameAnzeigen === true && sauber(k.spitzname) !== "";
}

/** Anzeigename mit Kennzeichen für den nicht unterscheidbaren Fall (Regel 4). */
export function anzeigenameDetail(
  kamerad: AnzeigeKamerad,
  kontext: readonly AnzeigeKamerad[],
): Anzeigename {
  if (zeigtSpitzname(kamerad)) return { text: sauber(kamerad.spitzname), mehrdeutig: false };

  const name = sauber(kamerad.name);
  const nameKey = schluessel(kamerad.name);
  const gleicherName = kontext.filter(
    (p) =>
      p.id !== kamerad.id &&
      p.aktiv !== false &&
      !zeigtSpitzname(p) &&
      schluessel(p.name) === nameKey,
  );
  if (gleicherName.length === 0) return { text: name, mehrdeutig: false };

  const vorname = sauber(kamerad.vorname);
  const vornameKey = schluessel(kamerad.vorname);
  const andere = gleicherName.map((p) => schluessel(p.vorname));
  if (vornameKey === "" || andere.includes(vornameKey)) {
    return { text: vorname ? `${name}, ${vorname}` : name, mehrdeutig: true };
  }

  for (let laenge = 1; laenge < vorname.length; laenge++) {
    // Ein Präfix endet immer auf einem Buchstaben ("Karl-H.", nicht "Karl-.").
    if (!BUCHSTABE.test(vorname[laenge - 1])) continue;
    const praefix = vornameKey.slice(0, laenge);
    if (!andere.some((v) => v.startsWith(praefix))) {
      return { text: `${name}, ${vorname.slice(0, laenge)}.`, mehrdeutig: false };
    }
  }
  // Kein kürzeres Präfix eindeutig (z. B. "Jan" neben "Jannik"): ganzer Vorname.
  return { text: `${name}, ${vorname}`, mehrdeutig: false };
}

/** Anzeigename einer Person, verglichen mit der Menge `kontext` (Regel oben). */
export function anzeigename(kamerad: AnzeigeKamerad, kontext: readonly AnzeigeKamerad[]): string {
  return anzeigenameDetail(kamerad, kontext).text;
}

/** Anzeigenamen für eine ganze Liste; jede Person wird gegen die Liste verglichen. */
export function anzeigenamen(kameraden: readonly AnzeigeKamerad[]): Map<number, Anzeigename> {
  const ergebnis = new Map<number, Anzeigename>();
  for (const k of kameraden) ergebnis.set(k.id, anzeigenameDetail(k, kameraden));
  return ergebnis;
}

/**
 * Externe Person: Name, optional die Organisation in Klammern ("Meyer (DRK)").
 * Ohne Namen nur die Organisation ("DRK"). `mitOrganisation: false` für enge
 * Darstellungen, in denen die Zelle sonst umbricht.
 */
export function anzeigenameExtern(
  person: AnzeigeExtern,
  optionen: { mitOrganisation?: boolean } = {},
): string {
  const name = sauber(person.name);
  const organisation = sauber(person.organisation);
  if (!name) return organisation;
  if (!organisation || optionen.mitOrganisation === false) return name;
  return `${name} (${organisation})`;
}
