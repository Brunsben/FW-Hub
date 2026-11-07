# core.set_karten_id – Eigentümer-Anforderung (Server)

Die Funktion `core.set_karten_id(integer, text)` (Migration
`drizzle/0005_food_set_karten_id.sql`) ist `SECURITY DEFINER`. Sie läuft also mit
den Rechten ihres **Eigentümers**, nicht mit denen von `fw_app`.

`core.kameraden` hat `FORCE ROW LEVEL SECURITY`. FORCE gilt auch für den
Tabelleneigentümer. Die Funktion setzt keinen PSA-Scope, ihr UPDATE träfe daher
unter RLS **0 Zeilen**. Die Funktion würde dann `P0002 (Kamerad nicht gefunden)`
melden, obwohl der Kamerad existiert.

## Anforderung

Der Eigentümer der Funktion muss RLS umgehen, also **Superuser** sein oder das
Attribut **BYPASSRLS** haben.

- Lokal (fwhub-postgres-dev): Die Migration läuft als `postgres` (Superuser) und
  erfüllt die Anforderung automatisch.
- Server: Die Migration läuft mit der Rolle aus `MIGRATE_DATABASE_URL`. Ist diese
  Rolle weder Superuser noch BYPASSRLS (z. B. ein reiner Schema-Eigentümer wie
  `nocodb`), muss die Funktion nach der Migration einer passenden Rolle
  übertragen werden. Das macht ein Administrator, nicht dieses Repo, und nie mit
  `fw_app` oder `fw_auth`.

## Prüfung (als Owner, nach der Migration)

```sql
SELECT p.proname,
       r.rolname AS owner,
       r.rolsuper,
       r.rolbypassrls,
       p.prosecdef AS security_definer,
       p.proconfig
FROM pg_proc p
JOIN pg_roles r ON r.oid = p.proowner
WHERE p.oid = 'core.set_karten_id(integer, text)'::regprocedure;
```

Erwartet: `rolsuper = t` oder `rolbypassrls = t`, `security_definer = t`,
`proconfig` enthält `search_path=core, pg_temp`.

Rechte prüfen: `\df+ core.set_karten_id` zeigt nur EXECUTE für `fw_app` und
den Eigentümer, nicht PUBLIC.

## Sicherheitsrahmen

- Die Funktion ändert ausschließlich `karten_id` (leerer String wird NULL) und
  `updated_at`.
- Sie verlangt `app.food_rolle = 'Admin'` in der laufenden Transaktion
  (`withFoodScope`), sonst SQLSTATE 42501.
- Es gibt keine zusätzliche Policy auf `core.kameraden`. Die Lese-Policies
  bleiben unverändert.
