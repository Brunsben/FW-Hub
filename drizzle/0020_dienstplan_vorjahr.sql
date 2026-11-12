-- Dienstplan Phase 7: Vorjahresanzeige (Spec 7.2), auch in der Präsentation.
-- ADDITIV (nur eine neue Funktion, kein Schema-Unterschied zum Drizzle-Snapshot).
--
-- dienstplan.vorjahr_themen(p_jahr) liefert für den Plan des Vorjahres
-- (p_jahr - 1, gleiche Organisation) je Termin Datum, Kategorie-Kürzel,
-- ausgefallen und die Thementitel in Reihenfolge. Keine Namen, keine Notizen,
-- keine Bemerkungen. Sichtbarkeit:
--   Admin/Planer   Vorjahresplan in jedem Status
--   Mitglied       nur freigegeben
--   Anzeige        nur freigegeben, und nur wenn das gültige Token zum Plan
--                  p_jahr gehört (der Token-Plan selbst bleibt der einzige
--                  Plan, dessen Zeilen der Anzeige-Scope lesen darf)
-- SECURITY DEFINER wie kameraden_namen(): Die Funktion setzt für die Abfrage
-- app.dienst_rolle/app.dienst_org auf die passende Rolle (Mitglied bzw. die
-- eigene) und stellt sie danach wieder her, damit sie auch mit einem
-- Eigentümer ohne RLS-Bypass dieselben Policies durchläuft. Die Filter auf
-- Organisation und Status stehen zusätzlich ausdrücklich in der Abfrage.
--
-- Rücknahme (als Owner): DROP FUNCTION dienstplan.vorjahr_themen(integer);

CREATE OR REPLACE FUNCTION dienstplan.vorjahr_themen(p_jahr integer)
RETURNS TABLE (datum date, kuerzel text, ausgefallen boolean, titel text[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_rolle text := COALESCE(current_setting('app.dienst_rolle', true), '');
  v_alt_org text := current_setting('app.dienst_org', true);
  v_org integer;
  v_planer boolean;
BEGIN
  IF v_rolle = 'Anzeige' THEN
    SELECT p.organisation_id INTO v_org
      FROM dienstplan.anzeige_tokens a JOIN dienstplan.plaene p ON p.id = a.plan_id
     WHERE a.token_hash = current_setting('app.dienst_anzeige', true)
       AND a.gueltig_bis > now() AND p.jahr = p_jahr;
    IF v_org IS NULL THEN
      RAISE EXCEPTION 'vorjahr_themen: Anzeige-Token ungültig oder anderer Plan' USING ERRCODE = '42501';
    END IF;
    v_planer := false;
  ELSIF v_rolle IN ('Admin', 'Planer', 'Mitglied') THEN
    v_org := NULLIF(v_alt_org, '')::integer;
    IF v_org IS NULL THEN
      RAISE EXCEPTION 'vorjahr_themen: keine Organisation im Scope' USING ERRCODE = '42501';
    END IF;
    v_planer := v_rolle IN ('Admin', 'Planer');
  ELSE
    RAISE EXCEPTION 'vorjahr_themen: nur im Dienstplan-Scope' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.dienst_rolle', CASE WHEN v_planer THEN v_rolle ELSE 'Mitglied' END, true);
  PERFORM set_config('app.dienst_org', v_org::text, true);
  RETURN QUERY
    SELECT t.datum, k.kuerzel, t.ausgefallen,
           COALESCE(array_agg(COALESCE(th.titel, tt.titel_freitext) ORDER BY tt.position, tt.id)
                    FILTER (WHERE tt.id IS NOT NULL), '{}'::text[])
      FROM dienstplan.plaene p
      JOIN dienstplan.termine t ON t.plan_id = p.id
      JOIN dienstplan.kategorien k ON k.id = t.kategorie_id
      LEFT JOIN dienstplan.termin_themen tt ON tt.termin_id = t.id
      LEFT JOIN dienstplan.themen th ON th.id = tt.thema_id
     WHERE p.organisation_id = v_org AND p.jahr = p_jahr - 1
       AND (v_planer OR p.status = 'freigegeben')
     GROUP BY t.id, t.datum, k.kuerzel, t.ausgefallen
     ORDER BY t.datum, t.id;
  PERFORM set_config('app.dienst_rolle', v_rolle, true);
  PERFORM set_config('app.dienst_org', COALESCE(v_alt_org, ''), true);
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION dienstplan.vorjahr_themen(integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION dienstplan.vorjahr_themen(integer) TO fw_app;
