BEGIN;

ALTER TABLE fw_food.registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE fw_food.registrations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS registrations_access ON fw_food.registrations;
CREATE POLICY registrations_access ON fw_food.registrations
  FOR ALL
  USING (
    current_setting('app.food_rolle', true) = 'Admin'
    OR current_setting('app.food_public', true) = 'true'
  )
  WITH CHECK (
    current_setting('app.food_rolle', true) = 'Admin'
    OR current_setting('app.food_public', true) = 'true'
  );

ALTER TABLE fw_food.mobile_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE fw_food.mobile_tokens FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mobile_tokens_read ON fw_food.mobile_tokens;
CREATE POLICY mobile_tokens_read ON fw_food.mobile_tokens
  FOR SELECT
  USING (
    current_setting('app.food_rolle', true) = 'Admin'
    OR current_setting('app.food_public', true) = 'true'
  );

DROP POLICY IF EXISTS mobile_tokens_write_insert ON fw_food.mobile_tokens;
CREATE POLICY mobile_tokens_write_insert ON fw_food.mobile_tokens
  FOR INSERT
  WITH CHECK (current_setting('app.food_rolle', true) = 'Admin');

DROP POLICY IF EXISTS mobile_tokens_write_update ON fw_food.mobile_tokens;
CREATE POLICY mobile_tokens_write_update ON fw_food.mobile_tokens
  FOR UPDATE
  USING (current_setting('app.food_rolle', true) = 'Admin')
  WITH CHECK (current_setting('app.food_rolle', true) = 'Admin');

DROP POLICY IF EXISTS mobile_tokens_write_delete ON fw_food.mobile_tokens;
CREATE POLICY mobile_tokens_write_delete ON fw_food.mobile_tokens
  FOR DELETE
  USING (current_setting('app.food_rolle', true) = 'Admin');

COMMIT;
