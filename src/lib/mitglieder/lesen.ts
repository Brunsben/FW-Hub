import { cache } from "react";
import { asc, desc, eq } from "drizzle-orm";
import type { JwtPayload } from "@/lib/auth";
import { benutzer, kameraden, mitgliederAudit } from "@/lib/db/schema";
import {
  withFoodScope,
  withFunkScope,
  withGlobalAdminScope,
  withScope,
  type ScopedTx,
} from "@/lib/db/scoped";
import {
  istFunkVerwaltung,
  istGlobalAdmin,
  istKuechenAdmin,
  istPsaVerwaltung,
  kannKartenIdSehen,
  kannRollenSehenUndBearbeiten,
  kannZugangSehenUndBearbeiten,
} from "./rechte";

// Lesen der Mitglieder für Liste, Detail und API. Jede Rolle liest im eigenen
// Datenbank-Scope (RLS entscheidet über die Zeilen). Welche Spalten in der
// Antwort landen, bestimmt die Projektion unten: Die Datenbank kann Lesen nicht
// pro Spalte trennen, deshalb ist diese Projektion der Schutz für Karten-ID,
// Rollen und Zugangsdaten. Der PIN-Hash wird nie selektiert.

export interface MitgliedZugang {
  benutzerId: number;
  benutzername: string;
  rolle: string;
  aktiv: boolean;
}

export interface MitgliedRollen {
  psa: string | null;
  food: string | null;
  fk: string | null;
  funk: string | null;
}

export interface Mitglied {
  id: number;
  vorname: string;
  name: string;
  dienstgrad: string | null;
  email: string | null;
  personalnummer: string | null;
  aktiv: boolean;
  /** Nur für Küchen-Admins. */
  kartenId?: string | null;
  /** Nur für globale Admins. null = es gibt keinen Login. */
  zugang?: MitgliedZugang | null;
  /** Nur für globale Admins. */
  rollen?: MitgliedRollen;
}

/**
 * Führt `fn` im Lese-Scope aus, der für diesen Benutzer die meisten Zeilen von
 * core.kameraden freigibt: globaler Admin, PSA-Verwaltung, Küchen-Admin,
 * Funk-Verwaltung, sonst nur die eigene Zeile.
 */
export function withLeseScope<T>(
  user: JwtPayload,
  fn: (tx: ScopedTx) => Promise<T>,
): Promise<T> {
  if (istGlobalAdmin(user)) return withGlobalAdminScope(user, fn);
  if (istPsaVerwaltung(user)) {
    return withScope({ kameradId: user.kamerad_id, psaRolle: user.psa_rolle ?? "" }, fn);
  }
  if (istKuechenAdmin(user)) {
    return withFoodScope({ kameradId: user.kamerad_id, foodRolle: "Admin" }, fn);
  }
  if (istFunkVerwaltung(user)) {
    return withFunkScope({ kameradId: user.kamerad_id, funkRolle: user.funk_rolle ?? "" }, fn);
  }
  return withScope({ kameradId: user.kamerad_id, psaRolle: "" }, fn);
}

type Zeile = {
  k: typeof kameraden.$inferSelect;
  // Drizzle liefert die linke Verknüpfung als ganzes Objekt oder null (kein Login).
  b: { id: number; benutzername: string; rolle: string; aktiv: boolean } | null;
};

function projiziere(user: JwtPayload, z: Zeile): Mitglied {
  const m: Mitglied = {
    id: z.k.id,
    vorname: z.k.vorname,
    name: z.k.name,
    dienstgrad: z.k.dienstgrad,
    email: z.k.email,
    personalnummer: z.k.personalnummer,
    aktiv: z.k.aktiv,
  };
  if (kannKartenIdSehen(user)) m.kartenId = z.k.kartenId;
  if (kannZugangSehenUndBearbeiten(user)) {
    m.zugang = z.b
      ? { benutzerId: z.b.id, benutzername: z.b.benutzername, rolle: z.b.rolle, aktiv: z.b.aktiv }
      : null;
  }
  if (kannRollenSehenUndBearbeiten(user)) {
    m.rollen = {
      psa: z.k.psaRolle,
      food: z.k.foodRolle,
      fk: z.k.fkRolle,
      funk: z.k.funkRolle,
    };
  }
  return m;
}

function auswahl(tx: ScopedTx) {
  return tx
    .select({
      k: kameraden,
      // Nie den PIN-Hash selektieren.
      b: {
        id: benutzer.id,
        benutzername: benutzer.benutzername,
        rolle: benutzer.rolle,
        aktiv: benutzer.aktiv,
      },
    })
    .from(kameraden)
    .leftJoin(benutzer, eq(benutzer.kameradId, kameraden.id));
}

/** Alle sichtbaren Mitglieder, nach Name sortiert. */
export async function listeMitglieder(user: JwtPayload): Promise<Mitglied[]> {
  const zeilen = await withLeseScope(user, (tx) =>
    auswahl(tx).orderBy(asc(kameraden.name), asc(kameraden.vorname)),
  );
  return zeilen.map((z) => projiziere(user, z));
}

/** Ein Mitglied oder null, wenn es nicht existiert oder nicht sichtbar ist. */
export async function ladeMitglied(user: JwtPayload, id: number): Promise<Mitglied | null> {
  const zeilen = await withLeseScope(user, (tx) =>
    auswahl(tx).where(eq(kameraden.id, id)).limit(1),
  );
  return zeilen[0] ? projiziere(user, zeilen[0]) : null;
}

/**
 * Wie ladeMitglied, aber innerhalb EINER Seitenanfrage nur einmal: Die Abschnitte
 * einer Seite bekommen dasselbe `user`-Objekt und dieselbe id und teilen sich so
 * die Abfrage (React cache). Außerhalb des Renderns verhält es sich wie ladeMitglied.
 */
export const ladeMitgliedGecacht = cache(ladeMitglied);

export interface VerlaufEintrag {
  id: number;
  zeitpunkt: Date;
  akteurName: string | null;
  abschnitt: string;
  feld: string;
  alt: string | null;
  neu: string | null;
}

/** Änderungsprotokoll einer Person. Nur globale Admins (RLS), sonst leer. */
export async function ladeVerlauf(
  user: JwtPayload,
  mitgliedId: number,
  limit = 100,
): Promise<VerlaufEintrag[]> {
  if (!istGlobalAdmin(user)) return [];
  return withGlobalAdminScope(user, (tx) =>
    tx
      .select({
        id: mitgliederAudit.id,
        zeitpunkt: mitgliederAudit.zeitpunkt,
        akteurName: mitgliederAudit.akteurName,
        abschnitt: mitgliederAudit.abschnitt,
        feld: mitgliederAudit.feld,
        alt: mitgliederAudit.alt,
        neu: mitgliederAudit.neu,
      })
      .from(mitgliederAudit)
      .where(eq(mitgliederAudit.kameradId, mitgliedId))
      .orderBy(desc(mitgliederAudit.zeitpunkt), desc(mitgliederAudit.id))
      .limit(limit),
  );
}

/** Filter und Suche für Liste und API (reine Funktion über die geladene Liste). */
export function filtereMitglieder(
  liste: Mitglied[],
  optionen: { suche?: string; status?: "alle" | "aktiv" | "inaktiv" | "ohne-login" },
): Mitglied[] {
  const suche = (optionen.suche ?? "").trim().toLowerCase();
  const status = optionen.status ?? "alle";
  return liste.filter((m) => {
    if (status === "aktiv" && !m.aktiv) return false;
    if (status === "inaktiv" && m.aktiv) return false;
    // "ohne Login" setzt voraus, dass Zugangsdaten sichtbar sind (nur Admins).
    // Ohne diese Sicht (zugang === undefined) lässt der Filter alles stehen; die
    // API lehnt den Filter für solche Benutzer vorher mit 400 ab.
    if (status === "ohne-login" && m.zugang !== null && m.zugang !== undefined) return false;
    if (!suche) return true;
    return [
      `${m.vorname} ${m.name}`,
      `${m.name} ${m.vorname}`,
      m.personalnummer ?? "",
      m.dienstgrad ?? "",
      m.zugang?.benutzername ?? "",
    ].some((t) => t.toLowerCase().includes(suche));
  });
}
