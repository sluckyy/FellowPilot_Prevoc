-- A trainee flag takes the question out of practice until someone reviews it (Sam, Oct 2026).
-- The status it had before is kept so a flag that isn't upheld puts it back exactly as it was.
BEGIN;
ALTER TABLE item ADD COLUMN status_before_review text CHECK (status_before_review IN ('pretest', 'live'));
-- Whether this flag took the question out (false when the flagger was over their weekly limit
-- or the question was already out). Kept for the flag-reliability model later.
ALTER TABLE flag ADD COLUMN suspended_item boolean NOT NULL DEFAULT false;
COMMIT;
