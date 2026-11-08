import { isIP } from "node:net";

// Bewertung der Client-IP für die Login-Sperre. Reine Funktionen ohne weitere
// Abhängigkeiten (läuft auch direkt unter Node, siehe scripts/test-client-ip.mjs).
//
// Ziel: Nur öffentliche Adressen dürfen eine IP-Sperre auslösen. Private,
// Loopback-, Link-Local-, Docker- und ähnliche Adressen stehen für eine
// kaputte Proxy-Kette (alle Nutzer hätten dieselbe interne Adresse). Sie
// werden wie "unbekannt" behandelt: Dann entfällt die IP-Sperre, statt alle
// auszusperren.
//
// Gespeichert wird die volle Adresse, IPv6 in kanonischer ausgeschriebener Form
// (8 Gruppen à 4 Hex-Ziffern, klein), damit sich das /64-Präfix ohne Casts per
// LIKE zählen lässt. IPv4-gemappte IPv6-Adressen (::ffff:a.b.c.d) werden zur
// IPv4-Adresse.
export const UNKNOWN_IP = "unbekannt";

export interface IpBewertung {
  /** Brauchbare öffentliche Adresse (kanonisch) oder UNKNOWN_IP. */
  ip: string;
  /** Warum die Eingabe nicht verwendet wurde (nur gesetzt, wenn ip = UNKNOWN_IP). */
  grund?: "ungueltig" | "nicht-oeffentlich";
}

export interface IpSchluessel {
  art: "v4" | "v6" | "unbekannt";
  /** Gleichheitsvergleich (v4, unbekannt) bzw. Muster für LIKE (v6, /64-Präfix). */
  wert: string;
}

function v4Oktette(ip: string): number[] | null {
  const teile = ip.split(".");
  if (teile.length !== 4) return null;
  const okt = teile.map((t) => (/^\d{1,3}$/.test(t) ? Number(t) : NaN));
  return okt.some((n) => !(n >= 0 && n <= 255)) ? null : okt;
}

// 8 Gruppen à 16 Bit. Erwartet eine von net.isIP als IPv6 bestätigte Adresse.
function v6Gruppen(eingabe: string): number[] | null {
  let s = eingabe.toLowerCase();
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  if (s.includes(".")) {
    const letzter = s.lastIndexOf(":");
    const okt = v4Oktette(s.slice(letzter + 1));
    if (!okt) return null;
    const hoch = (okt[0] << 8) | okt[1];
    const tief = (okt[2] << 8) | okt[3];
    s = `${s.slice(0, letzter + 1)}${hoch.toString(16)}:${tief.toString(16)}`;
  }
  const haelften = s.split("::");
  if (haelften.length > 2) return null;
  const kopf = haelften[0] ? haelften[0].split(":") : [];
  const ende = haelften.length === 2 && haelften[1] ? haelften[1].split(":") : [];
  if (haelften.length === 1 && kopf.length !== 8) return null;
  const fuell = 8 - kopf.length - ende.length;
  if (fuell < 0 || (haelften.length === 2 && fuell < 1)) return null;
  const gruppen = [...kopf, ...new Array<string>(fuell).fill("0"), ...ende].map((g) =>
    parseInt(g, 16),
  );
  return gruppen.length === 8 && gruppen.every((g) => g >= 0 && g <= 0xffff)
    ? gruppen
    : null;
}

function v4Oeffentlich(o: number[]): boolean {
  const [a, b] = o;
  if (a === 0) return false; // 0.0.0.0/8
  if (a === 10) return false; // privat
  if (a === 100 && b >= 64 && b <= 127) return false; // 100.64.0.0/10 (CGNAT, Tailscale)
  if (a === 127) return false; // Loopback
  if (a === 169 && b === 254) return false; // Link-Local
  if (a === 172 && b >= 16 && b <= 31) return false; // privat, enthält Docker-Netze
  if (a === 192 && b === 168) return false; // privat
  if (a === 198 && (b === 18 || b === 19)) return false; // Benchmark
  if (a >= 224) return false; // Multicast und reserviert (inkl. Broadcast)
  // Dokumentationsbereiche (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24)
  // gelten bewusst als öffentlich: In Produktion kommen sie nicht vor, Tests
  // können sie als stabile Fantasie-Adressen nutzen.
  return true;
}

function v6Oeffentlich(g: number[]): boolean {
  if (g.every((x) => x === 0)) return false; // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return false; // ::1
  if ((g[0] & 0xfe00) === 0xfc00) return false; // fc00::/7 (ULA)
  if ((g[0] & 0xffc0) === 0xfe80) return false; // fe80::/10 (Link-Local)
  if ((g[0] & 0xff00) === 0xff00) return false; // ff00::/8 (Multicast)
  // 2001:db8::/32 (Dokumentation) gilt wie bei IPv4 bewusst als öffentlich.
  return true;
}

const hex4 = (n: number) => n.toString(16).padStart(4, "0");

export function bewerteIp(roh: string | null | undefined): IpBewertung {
  const eingabe = (roh ?? "").trim();
  const art = eingabe.length > 0 && eingabe.length <= 64 ? isIP(eingabe) : 0;
  if (art === 4) {
    const okt = v4Oktette(eingabe);
    if (!okt) return { ip: UNKNOWN_IP, grund: "ungueltig" };
    return v4Oeffentlich(okt)
      ? { ip: okt.join(".") }
      : { ip: UNKNOWN_IP, grund: "nicht-oeffentlich" };
  }
  if (art === 6) {
    const g = v6Gruppen(eingabe);
    if (!g) return { ip: UNKNOWN_IP, grund: "ungueltig" };
    // ::ffff:a.b.c.d → IPv4
    if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
      const okt = [g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff];
      return v4Oeffentlich(okt)
        ? { ip: okt.join(".") }
        : { ip: UNKNOWN_IP, grund: "nicht-oeffentlich" };
    }
    return v6Oeffentlich(g)
      ? { ip: g.map(hex4).join(":") }
      : { ip: UNKNOWN_IP, grund: "nicht-oeffentlich" };
  }
  return { ip: UNKNOWN_IP, grund: "ungueltig" };
}

// Zählschlüssel einer bereits bewerteten Adresse (Ausgabe von bewerteIp).
//  * IPv4: exakt gleiche Adresse
//  * IPv6: gleiches /64-Präfix (Muster für LIKE, z. B. "2001:0db8:aaaa:bbbb:%").
//    Ein Nutzer bekommt üblicherweise ein ganzes /64, kann also beliebig viele
//    Adressen daraus verwenden. Gezählt wird deshalb pro Präfix.
//  * "unbekannt": alle Anfragen ohne brauchbare Adresse teilen sich einen Zähler
export function ipSchluessel(ip: string): IpSchluessel {
  if (ip === UNKNOWN_IP) return { art: "unbekannt", wert: UNKNOWN_IP };
  if (ip.includes(":")) {
    const praefix = ip.split(":").slice(0, 4).join(":");
    return { art: "v6", wert: `${praefix}:%` };
  }
  return { art: "v4", wert: ip };
}
