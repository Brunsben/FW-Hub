import { foodAbschnitt } from "@/components/food/mitglied-abschnitt";
import { funkAbschnitt } from "@/components/funk/mitglied-abschnitt";
import { psaAbschnitt } from "@/components/psa/mitglied-abschnitt";
import { rollenAbschnitt } from "@/components/mitglieder/abschnitte/rollen";
import { stammdatenAbschnitt } from "@/components/mitglieder/abschnitte/stammdaten";
import { verlaufAbschnitt } from "@/components/mitglieder/abschnitte/verlauf";
import { zugangAbschnitt } from "@/components/mitglieder/abschnitte/zugang";
import type { MitgliedAbschnitt } from "./abschnitte";

// Registry der Abschnitte auf /mitglieder/[id] und im Profil.
//
// Das ist die EINZIGE Stelle, an der Abschnitte bekannt gemacht werden. Die
// Seiten importieren nur diese Liste, keinen Abschnitt einzeln. Ein neues Modul
// (oder ein neuer Bereich) legt eine Datei mit einem `MitgliedAbschnitt` an
// (z. B. components/psa/mitglied-abschnitt.tsx) und trägt sie hier ein.
//
// Reihenfolge: Bereiche (Stammdaten 10, Zugang 20, Rollen 30), dann Module
// (PSA 100, Küche 110, Funk 120), zuletzt der Verlauf (900). Angezeigt wird nur,
// was `rechte()` für den Benutzer freigibt.
export const ABSCHNITTE: readonly MitgliedAbschnitt[] = [
  stammdatenAbschnitt,
  zugangAbschnitt,
  rollenAbschnitt,
  psaAbschnitt,
  foodAbschnitt,
  funkAbschnitt,
  verlaufAbschnitt,
];
