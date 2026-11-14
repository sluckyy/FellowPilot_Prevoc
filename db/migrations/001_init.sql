-- MCQ Coach — initial schema (walking skeleton)
-- Follows the Item Schema and Event Model specs. Postgres 16 (Azure Database for PostgreSQL Flexible Server).
-- Principles: the event log is append-only and the source of truth; derived tables can be rebuilt from it;
-- identity (names, emails) lives apart from analytics (pseudonymous user ids).

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid(), digest()

-- ---------------------------------------------------------------- tenancy and people
CREATE TABLE tenant (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{2,40}$'),
  name        text NOT NULL,
  state       text NOT NULL CHECK (state IN ('SA','NSW','VIC','QLD','WA','TAS','NT','ACT','NATIONAL')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app_user (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenant(id),
  roles         text[] NOT NULL DEFAULT ARRAY['trainee'],
  pseudonym     text,                          -- shown on opt-in leaderboards
  exam_date     date,
  created_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  CHECK (roles <@ ARRAY['trainee','supervisor','reviewer','editor','admin']::text[] AND cardinality(roles) > 0)
);

-- Identity kept apart from analytics: exports of events never need this table.
CREATE TABLE user_profile (
  user_id       uuid PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  email         text NOT NULL,
  display_name  text NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX user_profile_email_uq ON user_profile (lower(email));

CREATE TABLE consent (
  user_id              uuid PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  privacy_version      text NOT NULL,
  accepted_at          timestamptz NOT NULL DEFAULT now(),
  supervisor_view      boolean NOT NULL DEFAULT false,
  leaderboard_visible  boolean NOT NULL DEFAULT false
);

-- Invite-only sign-up. Only a hash of each token is stored.
CREATE TABLE invite (
  token_hash   bytea PRIMARY KEY,
  tenant_id    uuid NOT NULL REFERENCES tenant(id),
  email        text NOT NULL,
  roles        text[] NOT NULL DEFAULT ARRAY['trainee'],
  created_by   uuid REFERENCES app_user(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL DEFAULT now() + interval '14 days',
  used_at      timestamptz
);

-- Passwordless sign-in links (single use, short-lived).
CREATE TABLE login_token (
  token_hash   bytea PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL DEFAULT now() + interval '15 minutes',
  used_at      timestamptz
);

CREATE TABLE session (
  id_hash      bytea PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL DEFAULT now() + interval '30 days',
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  user_agent   text
);
CREATE INDEX session_user_idx ON session (user_id);

-- ---------------------------------------------------------------- content
CREATE TABLE item (
  id                uuid PRIMARY KEY,
  tenant_id         uuid REFERENCES tenant(id),        -- null = national item, any tenant may see it
  current_version   integer NOT NULL DEFAULT 1,
  status            text NOT NULL DEFAULT 'pretest'
                    CHECK (status IN ('draft','auto_checked','pretest','live','under_review','retired')),
  calibration_core  boolean NOT NULL DEFAULT false,
  template_id       uuid,
  retired_reason    text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE item_version (
  item_id            uuid NOT NULL REFERENCES item(id),
  version            integer NOT NULL CHECK (version >= 1),
  stem               text NOT NULL,
  lead_in            text NOT NULL CHECK (lead_in ~ '\?\s*$'),
  options            jsonb NOT NULL,          -- [{"id":"A","text":...}, ...] exactly A-D
  key                char(1) NOT NULL CHECK (key IN ('A','B','C','D')),
  explanations       jsonb NOT NULL,          -- {"A":..., "B":..., "C":..., "D":...}
  learning_point     text NOT NULL,
  rural_note         text NOT NULL DEFAULT '',
  learning_area      text NOT NULL,
  secondary_areas    text[] NOT NULL DEFAULT '{}',
  domains            text[] NOT NULL CHECK (cardinality(domains) BETWEEN 1 AND 3),
  presentation       text NOT NULL,
  context            text NOT NULL CHECK (context IN ('clinic','ed','ward','retrieval','remote','telehealth')),
  cognitive_level    text NOT NULL CHECK (cognitive_level IN ('recall','interpretation','management','rural_adaptation')),
  patient            jsonb NOT NULL,
  target_difficulty  smallint NOT NULL CHECK (target_difficulty BETWEEN 1 AND 5),
  jurisdiction       text NOT NULL DEFAULT 'national',
  provenance         text NOT NULL CHECK (provenance IN ('ai','trainee','supervisor','ai_edited_by_human')),
  author_id          uuid REFERENCES app_user(id),
  generation         jsonb,
  "references"       jsonb NOT NULL DEFAULT '[]',
  tutor_context      text NOT NULL DEFAULT '',
  review_level       text NOT NULL DEFAULT 'none' CHECK (review_level IN ('none','peer','expert')),
  reviewed_by        text[] NOT NULL DEFAULT '{}',   -- reviewer names/ids from the Review Desk
  review_by          date,
  supersedes         integer,
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, version),
  CHECK (jsonb_typeof(options) = 'array' AND jsonb_array_length(options) = 4),
  CHECK (explanations ?& ARRAY['A','B','C','D'])
);
-- Content of a published version never changes: any edit is a new version.
CREATE FUNCTION forbid_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; create a new row instead', TG_TABLE_NAME;
END $$;
CREATE TRIGGER item_version_immutable BEFORE UPDATE OR DELETE ON item_version
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

CREATE VIEW item_current AS
  SELECT i.id, i.tenant_id, i.status, i.calibration_core, i.template_id, v.*
  FROM item i JOIN item_version v ON v.item_id = i.id AND v.version = i.current_version;

-- ---------------------------------------------------------------- event log (append-only)
CREATE TABLE event (
  event_id     uuid NOT NULL,
  event_type   text NOT NULL CHECK (event_type IN (
    'item_presented','option_selected','confidence_set','item_flagged_for_review','item_revisited',
    'answer_submitted','answer_skipped','change_reason_given',
    'explanation_viewed','reference_opened','item_flag_raised','item_flag_resolved',
    'tutor_question_asked','tutor_answer_shown','tutor_answer_rated',
    'question_submitted','coaching_feedback_shown','question_reviewed',
    'product_feedback_given','feature_voted',
    'session_started','session_ended','diagnostic_completed','weekly_goal_set',
    'achievement_earned','duel_started','duel_finished',
    'study_guide_generated','study_guide_opened','consent_updated')),
  user_id      uuid NOT NULL,
  tenant_id    uuid NOT NULL,
  session_id   uuid NOT NULL,
  client_ts    timestamptz NOT NULL,
  server_ts    timestamptz NOT NULL DEFAULT now(),
  app_version  text NOT NULL,
  mode         text NOT NULL CHECK (mode IN ('learning','exam_sim','diagnostic','duel','scenario','none')),
  payload      jsonb NOT NULL DEFAULT '{}',
  -- A retried event has the same id and client time, so this key de-duplicates offline re-sends.
  PRIMARY KEY (event_id, client_ts)
) PARTITION BY RANGE (client_ts);

CREATE TABLE event_default PARTITION OF event DEFAULT;   -- catches odd device clocks

-- Monthly partitions; call ahead of time (the app runs it at start-up for this month and next).
CREATE FUNCTION ensure_event_partition(month_start date) RETURNS void LANGUAGE plpgsql
  SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m date := date_trunc('month', month_start)::date;
  name text := format('event_%s', to_char(m, 'YYYY_MM'));
BEGIN
  IF to_regclass(name) IS NULL THEN
    EXECUTE format('CREATE TABLE %I PARTITION OF event FOR VALUES FROM (%L) TO (%L)',
                   name, m, (m + interval '1 month')::date);
  END IF;
END $$;

CREATE INDEX event_user_ts_idx ON event (user_id, client_ts);
CREATE INDEX event_type_idx ON event (event_type, client_ts);

CREATE TRIGGER event_append_only BEFORE UPDATE OR DELETE ON event
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- ---------------------------------------------------------------- derived: one row per submitted answer
-- Correctness is decided here from the stored key, never trusted from the client payload.
CREATE TABLE answer (
  event_id          uuid PRIMARY KEY,
  user_id           uuid NOT NULL,
  tenant_id         uuid NOT NULL,
  item_id           uuid NOT NULL,
  item_version      integer NOT NULL,
  mode              text NOT NULL,
  final_option      char(1) NOT NULL CHECK (final_option IN ('A','B','C','D')),
  first_option      char(1) NOT NULL CHECK (first_option IN ('A','B','C','D')),
  correct           boolean NOT NULL,
  first_correct     boolean NOT NULL,
  final_confidence  smallint NOT NULL CHECK (final_confidence BETWEEN 1 AND 4),
  first_confidence  smallint CHECK (first_confidence BETWEEN 1 AND 4),
  n_changes         smallint NOT NULL DEFAULT 0,
  change_path       text NOT NULL DEFAULT '',
  ms_total          integer,
  attempt_number    integer NOT NULL DEFAULT 1,
  is_pretest        boolean NOT NULL DEFAULT false,
  points            integer NOT NULL,
  client_ts         timestamptz NOT NULL,
  FOREIGN KEY (item_id, item_version) REFERENCES item_version(item_id, version)
);
CREATE INDEX answer_user_idx ON answer (user_id, client_ts);
CREATE INDEX answer_item_idx ON answer (item_id, item_version);

-- Confidence levels map to the probability that the chosen answer is right (Event Model).
CREATE FUNCTION confidence_p(level smallint) RETURNS numeric IMMUTABLE LANGUAGE sql AS $$
  SELECT CASE level WHEN 1 THEN 0.25 WHEN 2 THEN 0.50 WHEN 3 THEN 0.75 WHEN 4 THEN 0.95 END
$$;

-- Confidence-weighted points: a proper scoring rule, so honest confidence earns most on average.
-- points = 60c + 80(1 - (c - p)^2) - 40
CREATE FUNCTION answer_points(correct boolean, level smallint) RETURNS integer IMMUTABLE LANGUAGE sql AS $$
  SELECT round(60 * c + 80 * (1 - (c - confidence_p(level))^2) - 40)::integer
  FROM (SELECT CASE WHEN correct THEN 1 ELSE 0 END::numeric AS c) s
$$;

CREATE FUNCTION derive_answer() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  k char(1);
  p jsonb := NEW.payload;
  fin char(1); fst char(1); conf smallint; ok boolean;
BEGIN
  IF NEW.event_type <> 'answer_submitted' THEN RETURN NEW; END IF;
  SELECT key INTO k FROM item_version
   WHERE item_id = (p->>'item_id')::uuid AND version = (p->>'item_version')::int;
  IF k IS NULL THEN
    RAISE EXCEPTION 'answer_submitted for unknown item version %/%', p->>'item_id', p->>'item_version';
  END IF;
  fin  := p->>'final_option_id';
  fst  := coalesce(p->>'first_option_id', p->>'final_option_id');
  conf := (p->>'final_confidence')::smallint;
  ok   := fin = k;
  INSERT INTO answer (event_id, user_id, tenant_id, item_id, item_version, mode, final_option, first_option,
                      correct, first_correct, final_confidence, first_confidence, n_changes, change_path,
                      ms_total, attempt_number, is_pretest, points, client_ts)
  VALUES (NEW.event_id, NEW.user_id, NEW.tenant_id, (p->>'item_id')::uuid, (p->>'item_version')::int, NEW.mode,
          fin, fst, ok, fst = k, conf, (p->>'first_confidence')::smallint,
          coalesce((p->>'n_changes')::smallint, 0), coalesce(p->>'change_path', ''),
          (p->>'ms_total')::int, coalesce((p->>'attempt_number')::int, 1),
          coalesce((p->>'is_pretest')::boolean, false), answer_points(ok, conf), NEW.client_ts)
  ON CONFLICT (event_id) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER event_derive_answer AFTER INSERT ON event
  FOR EACH ROW EXECUTE FUNCTION derive_answer();

-- ---------------------------------------------------------------- flags and feedback
CREATE TABLE flag (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id       uuid NOT NULL,
  item_version  integer NOT NULL,
  user_id       uuid NOT NULL REFERENCES app_user(id),
  reason        text NOT NULL CHECK (reason IN ('wrong_key','outdated','ambiguous','poor_distractor','not_rural_relevant','typo','other')),
  comment       text NOT NULL DEFAULT '',
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  outcome       text CHECK (outcome IN ('upheld','not_upheld','duplicate')),
  action        text CHECK (action IN ('edited','retired','none')),
  resolver_id   uuid REFERENCES app_user(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz,
  FOREIGN KEY (item_id, item_version) REFERENCES item_version(item_id, version)
);
-- Wrong-key flags come first in triage (48-hour target).
CREATE INDEX flag_open_idx ON flag (status, (reason = 'wrong_key') DESC, created_at);

CREATE TABLE product_feedback (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app_user(id),
  area        text NOT NULL,
  body        text NOT NULL,
  screen      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  actor_id    uuid,
  action      text NOT NULL,
  target      text,
  detail      jsonb NOT NULL DEFAULT '{}',
  at          timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- analytics views (computed, never stored by hand)
-- Calibration per user: accuracy in each confidence bin against its mapped probability.
CREATE VIEW user_calibration AS
  SELECT user_id, final_confidence AS confidence, confidence_p(final_confidence) AS expected,
         count(*) AS n, avg(correct::int)::numeric(5,3) AS accuracy
  FROM answer WHERE attempt_number = 1
  GROUP BY user_id, final_confidence;

-- Brier score and over/underconfidence per user (lower Brier is better; positive bias = overconfident).
CREATE VIEW user_calibration_summary AS
  SELECT user_id, count(*) AS n,
         avg((confidence_p(final_confidence) - correct::int)^2)::numeric(6,4) AS brier,
         (avg(confidence_p(final_confidence)) - avg(correct::int))::numeric(6,3) AS bias
  FROM answer WHERE attempt_number = 1
  GROUP BY user_id;

-- Answer-change impact on first attempts: net marks gained by changing.
CREATE VIEW user_change_stats AS
  SELECT user_id,
         count(*) FILTER (WHERE n_changes > 0)                                   AS changed,
         count(*) FILTER (WHERE n_changes > 0 AND NOT first_correct AND correct) AS wrong_to_right,
         count(*) FILTER (WHERE n_changes > 0 AND first_correct AND NOT correct) AS right_to_wrong,
         count(*) FILTER (WHERE n_changes > 0 AND NOT first_correct AND NOT correct) AS wrong_to_wrong,
         count(*) FILTER (WHERE n_changes > 0 AND NOT first_correct AND correct)
       - count(*) FILTER (WHERE n_changes > 0 AND first_correct AND NOT correct) AS net_gain
  FROM answer WHERE attempt_number = 1
  GROUP BY user_id;

-- Confidence quadrants (high = 3-4, low = 1-2).
CREATE VIEW user_quadrants AS
  SELECT user_id,
         count(*) FILTER (WHERE final_confidence >= 3 AND correct)     AS secure,
         count(*) FILTER (WHERE final_confidence >= 3 AND NOT correct) AS misconception,
         count(*) FILTER (WHERE final_confidence <= 2 AND correct)     AS fragile,
         count(*) FILTER (WHERE final_confidence <= 2 AND NOT correct) AS known_gap
  FROM answer WHERE attempt_number = 1
  GROUP BY user_id;

-- Accuracy per learning area (mastery map input until ability estimates arrive).
CREATE VIEW user_area_stats AS
  SELECT a.user_id, v.learning_area, count(*) AS n, avg(a.correct::int)::numeric(5,3) AS accuracy,
         sum(a.points) AS points
  FROM answer a JOIN item_version v ON v.item_id = a.item_id AND v.version = a.item_version
  WHERE a.attempt_number = 1
  GROUP BY a.user_id, v.learning_area;

-- Item statistics per version, first attempts only (Item Schema "Measured statistics").
CREATE VIEW item_version_stats AS
  SELECT item_id, item_version, count(*) AS n_responses,
         avg(correct::int)::numeric(5,3) AS p_value,
         jsonb_build_object('A', count(*) FILTER (WHERE final_option='A'), 'B', count(*) FILTER (WHERE final_option='B'),
                            'C', count(*) FILTER (WHERE final_option='C'), 'D', count(*) FILTER (WHERE final_option='D')) AS option_counts,
         avg((final_confidence = 4 AND NOT correct)::int)::numeric(5,3) AS high_conf_error_rate,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY ms_total) / 1000.0 AS median_time_s
  FROM answer WHERE attempt_number = 1 AND mode <> 'duel'
  GROUP BY item_id, item_version;

-- Weekly points (Monday start, Adelaide time) for goals and leaderboards.
CREATE VIEW user_weekly AS
  SELECT user_id, date_trunc('week', client_ts AT TIME ZONE 'Australia/Adelaide')::date AS week_start,
         count(*) AS answered, sum(points) AS points
  FROM answer GROUP BY user_id, 2;

-- ---------------------------------------------------------------- roles
-- The ingest path may only insert events; nobody updates or deletes them (trigger above).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcq_app') THEN CREATE ROLE mcq_app NOLOGIN; END IF;
END $$;
GRANT SELECT, INSERT ON event TO mcq_app;
GRANT SELECT, INSERT, UPDATE ON tenant, app_user, user_profile, consent, invite, login_token, session,
      item, flag, product_feedback TO mcq_app;
GRANT DELETE ON session, login_token TO mcq_app;
GRANT SELECT, INSERT ON item_version, answer, audit_log TO mcq_app;
GRANT USAGE ON SEQUENCE audit_log_id_seq TO mcq_app;
GRANT SELECT ON item_current, user_calibration, user_calibration_summary, user_change_stats,
      user_quadrants, user_area_stats, item_version_stats, user_weekly TO mcq_app;
GRANT EXECUTE ON FUNCTION ensure_event_partition(date) TO mcq_app;

CREATE TABLE schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
INSERT INTO schema_migrations VALUES ('001_init');

COMMIT;
