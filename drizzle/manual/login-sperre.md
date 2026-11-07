# Login-Sperre (core.login_attempts)

Umgesetzt in `src/lib/login-throttle.ts` und `src/app/api/auth/login/route.ts`.
Migrationen: `drizzle/0006_login_attempts.sql` (Tabelle) und
`drizzle/0007_login_attempts_rls.sql` (RLS + GRANTs).

## Regeln

| Ebene | Schwelle | Fenster | Sperrdauer |
| --- | --- | --- | --- |
| Benutzername (lowercase) | 5 Fehlversuche seit dem letzten erfolgreichen Login | 15 Min | bis 15 Min nach dem letzten Fehlversuch |
| IP | 30 Fehlversuche | 15 Min | bis 15 Min nach dem letzten Fehlversuch |

- Gesperrte Anfragen (HTTP 429 mit `Retry-After`) werden **nicht** als
  Fehlversuch gezählt und prüfen keine PIN (kein bcrypt).
- Die Sperre greift auch für nicht existierende oder inaktive Benutzernamen,
  damit sich über die Sperre keine Konten erraten lassen.
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

## Rettungsweg (Konto vorzeitig entsperren)

Als Tabellen-Eigentümer (lokal: Owner aus `MIGRATE_DATABASE_URL`, Server: durch
einen Admin), **nicht** als `fw_app`:

```sql
DELETE FROM core.login_attempts WHERE benutzername = '<name>';
```

`<name>` ist der Benutzername in Kleinbuchstaben. So entsperrst du eine IP:

```sql
DELETE FROM core.login_attempts WHERE ip = '<ip>' AND NOT erfolgreich;
```

## Annahme zur IP-Herkunft

Die IP-Sperre ist nur so zuverlässig wie die IP, die die App sieht.
`getClientIp` nutzt zuerst `X-Real-IP`, dann den **letzten** Eintrag von
`X-Forwarded-For`, sonst `unbekannt`. Bei `unbekannt` entfällt die IP-Sperre,
die Sperre pro Benutzername bleibt.

Next.js setzt `X-Forwarded-For` selbst, aber nur, wenn der Header fehlt
(`req.headers['x-forwarded-for'] ??= socket.remoteAddress` in
`next/dist/server/base-server.js`, Next 16.3). Es hängt nichts an. Hinter nginx
bleibt dessen Wert also unverändert. Ohne Proxy (lokal) steht dort die
Socket-Adresse, z. B. `::1`.

Stand von `nginx.conf` im Repo (geprüft):

- `location /` und `location ^~ /api/auth/` setzen beide
  `proxy_set_header X-Real-IP $remote_addr;` und
  `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`.
- `$remote_addr` ist die Client-IP, nachdem `real_ip_header CF-Connecting-IP`
  für Cloudflare-Adressen (`set_real_ip_from …`) ausgewertet wurde.
- nginx **überschreibt** `X-Real-IP` und damit einen vom Client mitgeschickten
  Wert. Bei `X-Forwarded-For` hängt nginx nur an, die linken Einträge sind also
  fälschbar. Deshalb wird nur der letzte Eintrag verwendet.

Die App setzt voraus:

1. **nginx setzt `X-Real-IP` selbst.** Fehlt diese Zeile in einer künftigen
   nginx-Konfiguration, ist nur noch die Sperre pro Benutzername verlässlich.
2. **Die App ist nicht direkt erreichbar.** In `docker-compose.yml` hat der
   Dienst `portal` kein `ports:`-Mapping, nur `nginx` veröffentlicht einen
   Port. Wer das Portal direkt erreicht, kann `X-Real-IP` frei setzen und die
   IP-Sperre umgehen. Die Sperre pro Benutzername bleibt auch dann wirksam.

Diese Annahme gilt nur für die Konfiguration im Repo. Die tatsächliche
Server-Konfiguration ist von hier aus nicht geprüft.
