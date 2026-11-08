// Eingabeprüfung für die Mitgliederverwaltung. Reine Funktionen ohne
// Abhängigkeiten (scripts/test-mitglieder-lib.mjs testet sie direkt).
//
// Bewusst nur Stammdaten: Rollenspalten und die Karten-ID werden hier nie
// angenommen. Sie schreiben ausschließlich set_kamerad_rollen und set_karten_id.
// Unbekannte Felder im Body werden ignoriert.

export interface StammdatenEingabe {
  vorname?: string;
  name?: string;
  dienstgrad?: string | null;
  email?: string | null;
  personalnummer?: string | null;
  aktiv?: boolean;
}

export interface LoginEingabe {
  benutzername: string;
  pin: string;
  rolle: "Admin" | "User";
}

export type Pruefung<T> = { ok: true; daten: T } | { ok: false; fehler: string };

const MAX = { vorname: 100, name: 100, dienstgrad: 50, email: 200, personalnummer: 50, benutzername: 64 };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const istObjekt = (b: unknown): b is Record<string, unknown> =>
  typeof b === "object" && b !== null && !Array.isArray(b);

function text(
  body: Record<string, unknown>,
  feld: keyof typeof MAX,
  bezeichnung: string,
  pflicht: boolean,
): { ok: true; wert: string | null | undefined } | { ok: false; fehler: string } {
  if (!(feld in body)) return { ok: true, wert: undefined };
  const roh = body[feld];
  if (roh === null || roh === "") {
    return pflicht
      ? { ok: false, fehler: `${bezeichnung} darf nicht leer sein` }
      : { ok: true, wert: null };
  }
  if (typeof roh !== "string") return { ok: false, fehler: `${bezeichnung} muss ein Text sein` };
  const wert = roh.trim();
  if (wert === "") {
    return pflicht
      ? { ok: false, fehler: `${bezeichnung} darf nicht leer sein` }
      : { ok: true, wert: null };
  }
  if (wert.length > MAX[feld]) {
    return { ok: false, fehler: `${bezeichnung} ist zu lang (höchstens ${MAX[feld]} Zeichen)` };
  }
  return { ok: true, wert };
}

/**
 * Stammdaten beim Anlegen (Vor- und Nachname Pflicht) oder Ändern (mindestens
 * ein bekanntes Feld). Leere optionale Felder werden zu null.
 */
export function pruefeStammdaten(
  body: unknown,
  modus: "anlegen" | "aendern",
): Pruefung<StammdatenEingabe> {
  if (!istObjekt(body)) return { ok: false, fehler: "Ungültiger Body" };
  const daten: StammdatenEingabe = {};

  for (const [feld, bezeichnung, pflicht] of [
    ["vorname", "Vorname", true],
    ["name", "Nachname", true],
    ["dienstgrad", "Dienstgrad", false],
    ["email", "E-Mail", false],
    ["personalnummer", "Personalnummer", false],
  ] as const) {
    const r = text(body, feld, bezeichnung, pflicht);
    if (!r.ok) return r;
    if (r.wert !== undefined) (daten as Record<string, unknown>)[feld] = r.wert;
  }
  if (daten.email && !EMAIL.test(daten.email)) {
    return { ok: false, fehler: "E-Mail-Adresse ist ungültig" };
  }
  if ("aktiv" in body) {
    if (typeof body.aktiv !== "boolean") return { ok: false, fehler: "aktiv muss true oder false sein" };
    daten.aktiv = body.aktiv;
  }

  if (modus === "anlegen") {
    if (!daten.vorname) return { ok: false, fehler: "Vorname ist erforderlich" };
    if (!daten.name) return { ok: false, fehler: "Nachname ist erforderlich" };
  } else if (Object.keys(daten).length === 0) {
    return {
      ok: false,
      fehler: "Keine Felder übergeben (vorname, name, dienstgrad, email, personalnummer, aktiv)",
    };
  }
  return { ok: true, daten };
}

/** Zugangsdaten beim Anlegen eines Logins. `minPin` kommt aus lib/benutzer-admin.ts. */
export function pruefeLogin(body: unknown, minPin: number): Pruefung<LoginEingabe> {
  if (!istObjekt(body)) return { ok: false, fehler: "Ungültige Zugangsdaten" };
  const benutzername = typeof body.benutzername === "string" ? body.benutzername.trim() : "";
  if (!benutzername || benutzername.length > MAX.benutzername || /\s/.test(benutzername)) {
    return {
      ok: false,
      fehler: `Benutzername erforderlich (ohne Leerzeichen, höchstens ${MAX.benutzername} Zeichen)`,
    };
  }
  const pin = typeof body.pin === "string" ? body.pin : "";
  if (pin.length < minPin) {
    return { ok: false, fehler: `PIN muss mindestens ${minPin} Zeichen lang sein` };
  }
  const rolle = body.rolle ?? "User";
  if (rolle !== "Admin" && rolle !== "User") {
    return { ok: false, fehler: "rolle muss Admin oder User sein" };
  }
  return { ok: true, daten: { benutzername, pin, rolle } };
}
