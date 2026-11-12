-- Dienstplan Phase 9: Versionen (Spec 8).
-- ADDITIV (eine Policy wird durch eine weitere ersetzt, Anzahl Policies bleibt 45).
--
-- Bisher lasen nur Planer und Admin plan_versionen. Für die Markierung
-- „geändert am …“ (Vergleich mit der letzten Freigabe, berechnet, nicht
-- gespeichert) brauchen auch Mitglieder die Freigabe-Versionen der Pläne, die
-- sie sehen dürfen. Die Plan-Unterabfrage läuft selbst unter RLS: Mitglieder
-- sehen nur freigegebene Pläne. Manuelle Versionen (Zwischenstände der Planung)
-- bleiben Planern vorbehalten. Der Anzeige-Scope (Fernseher) liest keine
-- Versionen (ist_mitglied() ist dort falsch).
--
-- Inhalt einer Version: Termine mit Themen, Verantwortlichen (Anzeigenamen zum
-- Zeitpunkt) und Notizen. Notizen sehen Mitglieder im freigegebenen Plan ohnehin.
--
-- Rücknahme (als Owner):
--   DROP POLICY plan_versionen_lesen ON dienstplan.plan_versionen;
--   CREATE POLICY plan_versionen_lesen ON dienstplan.plan_versionen FOR SELECT
--     USING (dienstplan.ist_planer() AND EXISTS (SELECT 1 FROM dienstplan.plaene p WHERE p.id = plan_id));

DROP POLICY IF EXISTS plan_versionen_lesen ON dienstplan.plan_versionen;--> statement-breakpoint
CREATE POLICY plan_versionen_lesen ON dienstplan.plan_versionen FOR SELECT
  USING (EXISTS (SELECT 1 FROM dienstplan.plaene p WHERE p.id = plan_id)
         AND (dienstplan.ist_planer() OR (dienstplan.ist_mitglied() AND anlass = 'freigabe')));
