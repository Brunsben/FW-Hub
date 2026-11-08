// Unit-Test für src/lib/client-ip.ts (Bewertung und Zählschlüssel der Client-IP).
// Aufruf: node scripts/test-client-ip.mjs   (kein Server, keine Datenbank nötig)
// Nutzt das Type-Stripping von Node (>= 22.18) für die reine TypeScript-Datei.
import { bewerteIp, ipSchluessel, UNKNOWN_IP } from "../src/lib/client-ip.ts";

let fail = 0;
const check = (name, ist, soll) => {
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  if (!ok) fail++;
  console.log(`${ok ? "OK  " : "FEHLER"} ${name}${ok ? "" : ` — ist ${JSON.stringify(ist)}, soll ${JSON.stringify(soll)}`}`);
};
const ip = (s) => bewerteIp(s).ip;
const grund = (s) => bewerteIp(s).grund;

// Öffentliche Adressen bleiben erhalten
check("öffentliche IPv4", ip("8.8.8.8"), "8.8.8.8");
check("IPv4 mit Leerzeichen", ip("  93.184.216.34 "), "93.184.216.34");
check("Dokumentationsadresse IPv4 gilt als öffentlich (Tests)", ip("203.0.113.7"), "203.0.113.7");
check("172.15.x (knapp unter privat) ist öffentlich", ip("172.15.1.1"), "172.15.1.1");
check("172.32.x (knapp über privat) ist öffentlich", ip("172.32.1.1"), "172.32.1.1");
check("100.63.x (knapp unter CGNAT) ist öffentlich", ip("100.63.0.1"), "100.63.0.1");

// Nicht öffentlich → unbekannt
for (const [n, a] of [
  ["Loopback", "127.0.0.1"], ["Loopback 127.1.2.3", "127.1.2.3"], ["10er", "10.0.0.5"],
  ["Docker 172.17", "172.17.0.2"], ["Docker 172.18.0.1 (Tunnel-Gateway)", "172.18.0.1"],
  ["172.31", "172.31.255.255"], ["192.168", "192.168.1.20"], ["Link-Local", "169.254.1.1"],
  ["CGNAT / Tailscale", "100.64.0.1"], ["0.0.0.0", "0.0.0.0"], ["Multicast", "224.0.0.1"],
  ["Broadcast", "255.255.255.255"], ["IPv6 Loopback", "::1"], ["IPv6 unspezifiziert", "::"],
  ["IPv6 ULA fc00", "fc00::1"], ["IPv6 ULA fd", "fd12:3456:789a::1"],
  ["IPv6 Link-Local", "fe80::1"], ["IPv6 Link-Local mit Zone", "fe80::1%eth0"],
  ["IPv6 Multicast", "ff02::1"], ["gemappt privat", "::ffff:10.0.0.1"], ["gemappt Loopback", "::ffff:127.0.0.1"],
]) {
  check(`${n} → unbekannt`, [ip(a), grund(a)], [UNKNOWN_IP, "nicht-oeffentlich"]);
}

// Ungültig → unbekannt
for (const [n, a] of [
  ["leer", ""], ["Text", "abc"], ["zu große Oktette", "999.1.1.1"], ["Leerzeichen innen", "8.8. 8.8"],
  ["Mehrere IPs", "8.8.8.8, 1.1.1.1"], ["mit Port", "8.8.8.8:443"], ["Skript", "<script>"],
  ["zu lang", "1".repeat(100)], ["führende Nullen", "08.8.8.8"],
]) {
  check(`${n} → ungültig`, [ip(a), grund(a)], [UNKNOWN_IP, "ungueltig"]);
}
check("null", [ip(null), grund(null)], [UNKNOWN_IP, "ungueltig"]);

// IPv6 kanonisch ausgeschrieben, gemappt → IPv4
check("IPv6 komprimiert", ip("2001:db8::1"), "2001:0db8:0000:0000:0000:0000:0000:0001");
check("IPv6 groß geschrieben", ip("2A00:1450:4001:81B::200E"), "2a00:1450:4001:081b:0000:0000:0000:200e");
check("IPv6 ausgeschrieben", ip("2001:0db8:0000:0000:0000:0000:0000:0001"), "2001:0db8:0000:0000:0000:0000:0000:0001");
check("IPv6 mit :: am Ende", ip("2001:db8:1:2::"), "2001:0db8:0001:0002:0000:0000:0000:0000");
check("IPv6 mit eingebettetem IPv4", ip("2001:db8::1.2.3.4"), "2001:0db8:0000:0000:0000:0000:0102:0304");
check("gemappt öffentlich → IPv4", ip("::ffff:8.8.8.8"), "8.8.8.8");
check("gemappt hex-Schreibweise → IPv4", ip("::ffff:0808:0808"), "8.8.8.8");

// Zählschlüssel
check("Schlüssel IPv4", ipSchluessel("8.8.8.8"), { art: "v4", wert: "8.8.8.8" });
check("Schlüssel unbekannt", ipSchluessel(UNKNOWN_IP), { art: "unbekannt", wert: "unbekannt" });
const a = ipSchluessel(ip("2001:db8:aaaa:bbbb::1")), b = ipSchluessel(ip("2001:db8:aaaa:bbbb:ffff:1:2:3")), c = ipSchluessel(ip("2001:db8:aaaa:bbbc::1"));
check("Schlüssel IPv6 = /64-Präfix als LIKE-Muster", a, { art: "v6", wert: "2001:0db8:aaaa:bbbb:%" });
check("zwei Adressen im selben /64 haben denselben Schlüssel", a.wert === b.wert, true);
check("anderes /64 hat anderen Schlüssel", a.wert === c.wert, false);

console.log(fail === 0 ? "\nALLE TESTS OK" : `\n${fail} TEST(S) FEHLGESCHLAGEN`);
process.exit(fail ? 1 : 0);
