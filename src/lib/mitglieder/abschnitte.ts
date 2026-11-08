import type { ReactNode } from "react";
import type { JwtPayload } from "@/lib/auth";
import type { AbschnittRechte } from "./rechte";

// Abschnitte der Mitgliederseite /mitglieder/[id] und des Profils.
//
// Jeder Abschnitt gehört einem Bereich (Stammdaten, Zugang, Rollen) oder einem
// Modul (PSA, Küche, Funk) und beschreibt sich selbst: Titel, Reihenfolge,
// Rechteprüfung und die Komponente. Die Seite kennt keinen Abschnitt fest. Sie
// geht nur die Registry (registry.ts) durch. Ein neues Modul trägt dort eine
// Zeile ein, so wie ein Portal-Modul in components/modul-icons.ts.
//
// Die Komponente ist eine Server-Komponente: Sie lädt ihre Daten selbst im
// passenden Datenbank-Scope (withScope, withFoodScope, …) und rendert bei Bedarf
// Client-Komponenten für Eingaben. Bearbeiten-Rechte prüft zusätzlich die
// jeweilige API-Route und letztlich die Datenbank.
export interface MitgliedAbschnittProps {
  mitgliedId: number;
  /** Aus rechte() für diesen Benutzer und diese Person. */
  bearbeiten: boolean;
  user: JwtPayload;
}

export interface MitgliedAbschnitt {
  /** Eindeutig, wird auch als Anker (#key) und data-Attribut verwendet. */
  key: string;
  titel: string;
  beschreibung?: string;
  /** Aufsteigend sortiert. Bereiche zuerst (10er-Schritte), Module danach. */
  reihenfolge: number;
  /**
   * Erscheint der Abschnitt im Profil ("Meine Daten", immer schreibgeschützt)?
   * Nur für persönliche Daten: Stammdaten, PSA, Funk. Zugang, Rollen, Küche
   * (Karten-ID, QR-Link) und Verlauf sind Verwaltungssache.
   */
  profil?: boolean;
  /** Wer sieht und wer ändert den Abschnitt (für diese Person). */
  rechte(user: JwtPayload, mitgliedId: number): AbschnittRechte;
  Komponente: (props: MitgliedAbschnittProps) => ReactNode | Promise<ReactNode>;
}

export interface SichtbarerAbschnitt {
  abschnitt: MitgliedAbschnitt;
  bearbeiten: boolean;
}

/** Die für diesen Benutzer sichtbaren Abschnitte in Anzeigereihenfolge. */
export function sichtbareAbschnitte(
  abschnitte: readonly MitgliedAbschnitt[],
  user: JwtPayload,
  mitgliedId: number,
): SichtbarerAbschnitt[] {
  const ergebnis: SichtbarerAbschnitt[] = [];
  for (const abschnitt of abschnitte) {
    const recht = abschnitt.rechte(user, mitgliedId);
    if (recht.sehen) ergebnis.push({ abschnitt, bearbeiten: recht.bearbeiten });
  }
  return ergebnis.sort((a, b) => a.abschnitt.reihenfolge - b.abschnitt.reihenfolge);
}
