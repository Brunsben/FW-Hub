# Login-Sperre (core.login_attempts)

Umgesetzt in `src/lib/login-throttle.ts`, `src/lib/client-ip.ts` und
`src/app/api/auth/login/route.ts` (die PIN-Änderung nutzt dieselbe Sperre).
Migrationen: `drizzle/0006_login_attempts.sql` (Tabelle) und
`drizzle/0007_login_attempts_rls.sql` (RLS + GRANTs).

## Regeln

Gezählt werden Fehlversuche innerhalb von 15 Minuten. Die Sperre dauert bis
15 Minuten nach dem letzten Fehlversuch.

| Ebene | Schwelle | Zählt | Zurückgesetzt durch |
| --- | --- | --- | --- |
| **Name + IP** | 5 Fehlversuche | derselbe Benutzername (klein geschrieben) von derselben IP | Erfolg desselben Namens von derselben IP |
| **Name allein** | 50 Fehlversuche | derselbe Benutzername von beliebigen IPs | Erfolg dieses Namens |
| **IP** | 30 Fehlversuche | alle Namen von derselben IP | läuft nach 15 Minuten ab |

- **Warum Name + IP:** Wer ein fremdes Konto mit falschen PINs beschießt, sperrt
  nur sich selbst. Der echte Nutzer kommt von seiner eigenen IP weiter hinein.
  Die hohe Grenze pro Name fängt verteilte Angriffe von vielen IPs ab.
- **IPv6** wird für die IP-Sperre und Name + IP pro **/64-Präfix** gezählt, weil
  ein Anschluss üblicherweise ein ganzes /64 bekommt und beliebig viele Adressen
  daraus nutzen kann. In der Tabelle steht weiter die volle Adresse, in
  kanonischer ausgeschriebener Form (`2001:0db8:aaaa:bbbb:0000:0000:0000:0001`).
- **"unbekannt":** Hat die App keine brauchbare öffentliche Adresse (siehe
  unten), landet der Versuch im Zähler `unbekannt`. Die IP-Sperre entfällt dann,
  und Name + IP wirkt wie eine Sperre pro Name (5). Eine kaputte Proxy-Kette
  sperrt so nicht alle aus.
- Gesperrte Anfragen (HTTP 429 mit `Retry-After`) werden **nicht** als
  Fehlversuch gezählt und prüfen keine PIN (kein bcrypt).
- Die Sperre greift auch für nicht existierende oder inaktive Benutzernamen,
  damit sich über die Sperre keine Konten erraten lassen.
- Ein deaktiviertes Konto mit richtiger PIN zählt wie ein Fehlversuch.
- Auch die **richtige** PIN wird während einer Sperre abgelehnt.
- Einträge älter als 24 Stunden werden bei jedem Login-Versuch gelöscht.

## Rechte

- Zugriff ausschließlich über `authDb` (Rolle `fw_auth`, BYPASSRLS):
  `GRANT SELECT, INSERT, DELETE` auf die Tabelle und `USAGE` auf die Sequenz.
- RLS ist mit `FORCE` aktiv und hat **keine Policy**. `fw_app` sieht und
  schreibt deshalb nichts.
- Zusätzlich hat `fw_app` **keine Rechte** auf Tabelle und Sequenz. `ALTER
  DEFAULT PRIVILEGES` (create-fw-app-role.sql) hatte `fw_app` beim Anlegen
  automatisch `arwd` gegeben. `drizzle/0009_login_attempts_revoke_fw_app.sql`
  entzieht das wieder (`REVOKE ALL … FROM fw_app` auf Tabelle und Sequenz).
- **Allgemeine Regel:** Jede Tabelle, die nur `fw_auth` gehören soll, muss
  nach dem Anlegen so bereinigt werden. Sonst erhält `fw_app` über die
  Default-Privileges automatisch Rechte.
- Prüfung: `\dp core.login_attempts` und `\dp core.login_attempts_id_seq`
  zeigen nur `postgres` (Eigentümer) und `fw_auth`.

## Rettungsweg (Konto oder IP vorzeitig entsperren)

Als Tabellen-Eigentümer (lokal: Owner aus `MIGRATE_DATABASE_URL`, Server: durch
einen Admin), **nicht** als `fw_app`:

```sql
-- ein Konto, von allen IPs
DELETE FROM core.login_attempts WHERE benutzername = '<name>';
-- eine IPv4-Adresse
DELETE FROM core.login_attempts WHERE ip = '<ip>' AND NOT erfolgreich;
-- ein IPv6-/64 (Präfix aus den ersten vier Gruppen der ausgeschriebenen Adresse)
DELETE FROM core.login_attempts WHERE ip LIKE '2001:0db8:aaaa:bbbb:%' AND NOT erfolgreich;
-- Zähler "unbekannt"
DELETE FROM core.login_attempts WHERE ip = 'unbekannt' AND NOT erfolgreich;
```

`<name>` ist der Benutzername in Kleinbuchstaben.

## IP-Herkunft und Proxy-Kette

Die IP-Sperre ist nur so zuverlässig wie die IP, die die App sieht.

### Was die App liest und prüft
`getClientIp` nimmt `X-Real-IP`, sonst den **letzten** Eintrag von
`X-Forwarded-For` (die linken Einträge sind vom Client fälschbar), sonst
`unbekannt`. Die App liest `CF-Connecting-IP` nie selbst: Vertrauen entscheidet
allein nginx.

Der Wert wird mit `net.isIP` geprüft (`src/lib/client-ip.ts`). Als **"unbekannt"**
gelten, jeweils mit einer Warnung im Log (höchstens eine pro Wert und
10 Minuten):

- ungültige Werte (Text, mehrere Adressen, Adresse mit Port, zu lang)
- Loopback (`127.0.0.0/8`, `::1`), unspezifiziert, Link-Local
  (`169.254.0.0/16`, `fe80::/10`)
- private Netze (`10/8`, `172.16/12` mit allen Docker-Netzen, `192.168/16`,
  `fc00::/7`), CGNAT/Tailscale (`100.64/10`), Multicast und reserviert
- IPv4-gemappte IPv6-Adressen werden zur IPv4-Adresse und dann bewertet

Eine Warnung im Log heißt: Die Kette ist kaputt, alle Nutzer erscheinen mit einer
internen Adresse. Dann zuerst nginx `real_ip` und den Tunnel prüfen (unten).

### Aufbau auf dem Server (Stand 08.11.2026)
```
Browser → Cloudflare → Cloudflare Tunnel (cloudflared, Host-Dienst)
        → http://127.0.0.1:8180 → nginx (Container fw_nginx) → portal :8080
```
- `cloudflared` läuft als **Host-Dienst** und verbindet auf `127.0.0.1:8180`.
- Der nginx-Port 8180 ist in `feuerwehr-portal/docker-compose.yml` auf
  **`127.0.0.1`** gebunden. 8190 (Uptime-Kuma-Proxy, aus dem LAN genutzt) und
  8192 (Homarr) sind davon unabhängig und unverändert.
- `feuerwehr-portal/docker-compose.yml` wurde auf dem Server **lokal geändert**
  und liegt nicht im Repo. Die Datei in diesem Repo (`docker-compose.yml`) bindet
  8180 inzwischen ebenfalls an Loopback, damit der sichere Stand nicht durch eine
  Kopie zurückgedreht wird.
- Die nginx-Konfiguration auf dem Server liegt ebenfalls im Verzeichnis
  `feuerwehr-portal`. `nginx.conf` in diesem Repo ist die Referenz und muss bei
  Änderungen dort von Hand abgeglichen werden.

### Warum 172.18.0.1 vertrauenswürdig ist
nginx übernimmt `CF-Connecting-IP` nur von Gegenstellen aus `set_real_ip_from`.
Eine Verbindung vom Host auf einen veröffentlichten Docker-Port sieht der
Container mit der **Gateway-Adresse des Docker-Netzes** (hier `172.18.0.1`) als
Absender, nicht als `127.0.0.1`. Ohne `set_real_ip_from 172.18.0.1;` würde nginx
`CF-Connecting-IP` ignorieren, und alle Nutzer erschienen mit `172.18.0.1`.

Das Vertrauen ist vertretbar, weil über diese Adresse nur **Prozesse des Hosts**
nginx erreichen, solange der Port auf `127.0.0.1` gebunden ist. Der einzige
Prozess, der dort `CF-Connecting-IP` setzt, ist `cloudflared`, und Cloudflare
überschreibt den Header mit der echten Client-IP.

### Wichtig: 8180 darf nicht wieder auf 0.0.0.0 gebunden werden
Mit `0.0.0.0:8180` wäre nginx aus dem LAN erreichbar. Das Docker-NAT zeigt auch
LAN-Verbindungen unter Umständen mit der Gateway-Adresse, dann könnte jeder
`CF-Connecting-IP` frei setzen und die IP-Sperre beliebig umgehen (die Sperren
pro Name bleiben wirksam). Die Adresse `172.18.0.1` gilt außerdem nur für dieses
Docker-Netz. Ändert sich das Netz, mit `docker network inspect <netz>` die
Gateway-Adresse prüfen und `set_real_ip_from` anpassen.

### Cloudflare-Netze in nginx.conf
Die Liste der Cloudflare-Netze (IPv4 und IPv6) in `nginx.conf` ist nur für den
**direkten Proxy-Betrieb** relevant (orange Wolke, Cloudflare verbindet selbst
mit dem Server). Im Tunnel-Betrieb kommen keine Verbindungen aus diesen Netzen.
Quelle: `https://www.cloudflare.com/ips-v4` und `/ips-v6`. Stand 08.11.2026,
ergänzt um `131.0.72.0/22` und die sieben IPv6-Bereiche.

Eine `set_real_ip_from`-Liste im `server`-Block **ersetzt** die Angaben aus
`conf.d/ratelimit.conf` (`http`-Ebene), sie wird nicht ergänzt. Das
`set_real_ip_from 127.0.0.1;` in `nginx-ratelimit.conf` ist daher wirkungslos,
solange der `server`-Block eine eigene Liste hat.

### Prüfen (auf dem Server)
```sql
-- Kommen echte öffentliche Adressen an? Eine einzige interne Adresse oben = Kette kaputt.
SELECT ip, count(*) FROM core.login_attempts GROUP BY ip ORDER BY 2 DESC LIMIT 10;
```
Dazu im Log des Containers `fw_portal` nach `Login-Sperre: Client-IP` suchen. Und
`docker exec fw_nginx nginx -T | grep -E "real_ip"` zeigt die wirksame Liste.

### Voraussetzungen der App
1. **nginx setzt `X-Real-IP` selbst** (`proxy_set_header X-Real-IP $remote_addr;`
   in `location /` und `location ^~ /api/auth/`). Fehlt die Zeile, ist nur noch
   die Sperre pro Name verlässlich.
2. **Die App ist nicht direkt erreichbar.** Wer das Portal direkt erreicht (ein
   veröffentlichter Port, ein anderer Container im Netz `fw-network`), kann
   `X-Real-IP` frei setzen und die IP-Sperre umgehen. Im Repo hat `portal` kein
   `ports:`-Mapping. Den Stack `~/fw/fwhub-stack` auf dem Server separat prüfen.
