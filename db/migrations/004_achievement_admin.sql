-- Admins edit achievement definitions in the app (Admin › Achievements). Definitions are never deleted,
-- because earned records point at them; they are switched off instead.
BEGIN;
ALTER TABLE achievement_def ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE achievement_def ADD COLUMN updated_by uuid REFERENCES app_user(id);
GRANT INSERT, UPDATE ON achievement_def TO mcq_app;
COMMIT;
