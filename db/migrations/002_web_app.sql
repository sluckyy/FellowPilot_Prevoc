-- MCQ Coach — what the first web app needs on top of 001.
BEGIN;

-- The beta's first tenant.
INSERT INTO tenant (slug, name, state) VALUES ('sa', 'South Australia', 'SA')
  ON CONFLICT (slug) DO NOTHING;

ALTER TABLE app_user ADD COLUMN last_sign_in_at timestamptz;
ALTER TABLE app_user ADD COLUMN invited_by uuid REFERENCES app_user(id);

-- Sign-in link rate limiting looks up recent tokens per user.
CREATE INDEX login_token_user_created_idx ON login_token (user_id, created_at);

-- Feedback lookups: has this user answered this item version?
CREATE INDEX answer_user_item_idx ON answer (user_id, item_id, item_version);

-- Clients can't send events stamped far in the future (validated in the app too); this keeps
-- monthly partitions creatable later, since the default partition never holds a future month.
ALTER TABLE event ADD CONSTRAINT event_client_ts_sane
  CHECK (client_ts < server_ts + interval '1 day');

GRANT SELECT, INSERT, UPDATE ON tenant TO mcq_app;

COMMIT;
