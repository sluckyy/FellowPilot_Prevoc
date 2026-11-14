-- FellowPilot Prevocational: tracks, the AMC outcome-statement curriculum, and the gamification the
-- prevocational beta adds (XP levels, streak pauses, seasons, teams, goal plans, reflective logbook).
-- Everything here is additive so the same schema can later host the ACRRM track too.
BEGIN;

-- ---------------------------------------------------------------- tenancy and track
ALTER TABLE tenant ADD COLUMN track text NOT NULL DEFAULT 'prevocational'
  CHECK (track IN ('acrrm', 'prevocational'));
-- The beta's tenant. 002 created 'sa' (used by the ACRRM beta); the prevocational beta runs under YNLHN.
UPDATE tenant SET track = 'acrrm' WHERE slug = 'sa';
INSERT INTO tenant (slug, name, state, track) VALUES ('ynlhn', 'Yorke and Northern Local Health Network', 'SA', 'prevocational')
  ON CONFLICT (slug) DO NOTHING;

ALTER TABLE app_user ADD COLUMN pgy_level smallint CHECK (pgy_level IN (1, 2));
ALTER TABLE app_user ADD COLUMN setting_preference text NOT NULL DEFAULT 'any' CHECK (setting_preference IN ('rural', 'metro', 'any'));
ALTER TABLE app_user ADD COLUMN img boolean NOT NULL DEFAULT false;   -- international medical graduate pathway, trainee-set
ALTER TABLE app_user ADD COLUMN term_start date;                       -- current term, for the onboarding check-in schedule

-- ---------------------------------------------------------------- items: generic curriculum tags
-- `domains` already holds 1-3 codes per item; for the prevocational track these are AMC outcome
-- statement codes ("1.9"). Contexts and cognitive levels gain the prevocational values; the ACRRM
-- values stay valid so both tracks' items can live in one bank.
ALTER TABLE item_version DROP CONSTRAINT item_version_context_check;
ALTER TABLE item_version ADD CONSTRAINT item_version_context_check
  CHECK (context IN ('clinic','ed','ward','retrieval','remote','telehealth','theatre','after_hours','rural'));
ALTER TABLE item_version DROP CONSTRAINT item_version_cognitive_level_check;
ALTER TABLE item_version ADD CONSTRAINT item_version_cognitive_level_check
  CHECK (cognitive_level IN ('recall','interpretation','management','rural_adaptation','prioritisation'));
ALTER TABLE item_version ADD COLUMN pgy_level text NOT NULL DEFAULT 'both' CHECK (pgy_level IN ('PGY1','PGY2','both'));
ALTER TABLE item_version ADD COLUMN clinical_experiences text[] NOT NULL DEFAULT '{}'
  CHECK (clinical_experiences <@ ARRAY['A','B','C','D']::text[]);
ALTER TABLE item_version ADD COLUMN setting text NOT NULL DEFAULT 'any' CHECK (setting IN ('rural','metro','any'));
-- rural_note is kept as the column name (the ACRRM track reads it); the prevocational app shows it as "setting note".

-- item_current gains the new columns (CREATE OR REPLACE may only append columns, which this does).
CREATE OR REPLACE VIEW item_current AS
  SELECT i.id, i.tenant_id, i.status, i.calibration_core, i.template_id, v.*
  FROM item i JOIN item_version v ON v.item_id = i.id AND v.version = i.current_version;

ALTER TABLE flag DROP CONSTRAINT flag_reason_check;
ALTER TABLE flag ADD CONSTRAINT flag_reason_check
  CHECK (reason IN ('wrong_key','outdated','ambiguous','poor_distractor','not_rural_relevant','not_junior_scope','typo','other'));

-- ---------------------------------------------------------------- events the prevocational modules emit
ALTER TABLE event DROP CONSTRAINT event_event_type_check;
ALTER TABLE event ADD CONSTRAINT event_event_type_check CHECK (event_type IN (
    'item_presented','option_selected','confidence_set','item_flagged_for_review','item_revisited',
    'answer_submitted','answer_skipped','change_reason_given',
    'explanation_viewed','reference_opened','item_flag_raised','item_flag_resolved',
    'tutor_question_asked','tutor_answer_shown','tutor_answer_rated',
    'question_submitted','coaching_feedback_shown','question_reviewed',
    'product_feedback_given','feature_voted',
    'session_started','session_ended','diagnostic_completed','weekly_goal_set',
    'achievement_earned','duel_started','duel_finished',
    'study_guide_generated','study_guide_opened','consent_updated',
    'goal_plan_created','goal_plan_revised','checkin_completed',
    'reflection_logged','reflection_tags_confirmed','streak_pause_set',
    'season_started','team_joined','team_left','level_reached'));

-- ---------------------------------------------------------------- onboarding: goal plan and check-ins
-- A new row per revision; the latest version is the current plan. Goals link to outcome statements.
CREATE TABLE goal_plan (
  user_id          uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  version          integer NOT NULL CHECK (version >= 1),
  career_intent    text NOT NULL DEFAULT '' CHECK (length(career_intent) <= 400),
  strengths        text NOT NULL DEFAULT '' CHECK (length(strengths) <= 1000),
  concerns         text NOT NULL DEFAULT '' CHECK (length(concerns) <= 1000),
  learning_prefs   text NOT NULL DEFAULT '' CHECK (length(learning_prefs) <= 600),
  goals            jsonb NOT NULL,            -- [{"text": "...", "outcomes": ["1.9", "1.8"]}], 1-4 goals
  checkin_due      date NOT NULL,             -- six months on, or when the trainee chooses
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, version),
  CHECK (jsonb_typeof(goals) = 'array' AND jsonb_array_length(goals) BETWEEN 1 AND 4)
);

-- ---------------------------------------------------------------- reflective logbook (text only in the beta)
-- The body is encrypted by the app with a key derived per trainee; tags and timing stay in clear so
-- coverage can be computed and the gamification engine can count that a reflection was logged.
CREATE TABLE reflection (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  tenant_id    uuid NOT NULL REFERENCES tenant(id),
  body_enc     bytea NOT NULL,                -- AES-256-GCM: 12-byte nonce || ciphertext || 16-byte tag
  words        integer NOT NULL DEFAULT 0 CHECK (words >= 0),
  tags         text[] NOT NULL DEFAULT '{}',  -- outcome statement codes the trainee confirmed
  prompt_id    text NOT NULL DEFAULT '',      -- which light prompt was shown, if any
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
CREATE INDEX reflection_user_idx ON reflection (user_id, created_at DESC) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------- streak protection
-- A pause covers whole days; weeks that overlap a pause neither count nor break the streak.
CREATE TABLE streak_pause (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  starts_on   date NOT NULL,
  ends_on     date NOT NULL,
  reason      text NOT NULL CHECK (reason IN ('nights', 'leave', 'exams', 'other')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on AND ends_on - starts_on <= 60)
);
CREATE INDEX streak_pause_user_idx ON streak_pause (user_id, starts_on);

-- ---------------------------------------------------------------- seasons (monthly themed challenges, admin-configured)
CREATE TABLE season (
  id          text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]{2,40}$'),
  tenant_id   uuid REFERENCES tenant(id),    -- null = every tenant
  title       text NOT NULL CHECK (length(title) BETWEEN 2 AND 60),
  theme       text NOT NULL DEFAULT '' CHECK (length(theme) <= 300),
  starts_on   date NOT NULL,
  ends_on     date NOT NULL,
  challenge   jsonb NOT NULL,                 -- {"type": "answered"|"reflections"|"areas_covered"|"area_answered", "n": 50, "area": "..."}
  team_goal   integer,                        -- optional team target for the same challenge type
  focus_areas text[] NOT NULL DEFAULT '{}',   -- learning areas highlighted this season
  active      boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES app_user(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on AND challenge ? 'type' AND challenge ? 'n')
);

-- ---------------------------------------------------------------- teams (site or cohort groups)
CREATE TABLE team (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenant(id),
  name        text NOT NULL CHECK (length(name) BETWEEN 2 AND 40),
  kind        text NOT NULL DEFAULT 'site' CHECK (kind IN ('site', 'cohort', 'other')),
  join_code   text NOT NULL UNIQUE CHECK (join_code ~ '^[A-Z0-9]{6}$'),
  created_by  uuid REFERENCES app_user(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX team_name_uq ON team (tenant_id, lower(name));

CREATE TABLE team_member (
  team_id    uuid NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);
-- One team per trainee in the beta.
CREATE UNIQUE INDEX team_member_user_uq ON team_member (user_id);

-- ---------------------------------------------------------------- achievements for the prevocational track
-- The ACRRM-specific ones are switched off for this tenant by leaving them national but renaming the
-- area counts; new ones are added here. Definitions are records, so admins can change them in the app.
UPDATE achievement_def SET description = 'Answer questions in 10 different learning areas.' WHERE id = 'explorer';
UPDATE achievement_def SET title = 'Whole curriculum', description = 'Answer questions in all 20 learning areas.', rule = '{"type":"areas_covered","n":20}' WHERE id = 'whole-curriculum';
INSERT INTO achievement_def (id, title, description, rule, sort) VALUES
  ('first-reflection', 'First reflection',   'Log your first reflection.',                                 '{"type":"reflections","n":1}', 150),
  ('reflective',       'Reflective',         'Log 10 reflections.',                                        '{"type":"reflections","n":10}', 160),
  ('plan-set',         'Plan in place',      'Create your goal plan at onboarding.',                       '{"type":"goal_plans","n":1}', 5),
  ('outcomes-half',    'Half the framework', 'Have evidence against 14 of the 28 outcome statements.',     '{"type":"outcomes_covered","n":14}', 170),
  ('outcomes-all',     'Whole framework',    'Have evidence against all 28 outcome statements.',           '{"type":"outcomes_covered","n":28}', 180),
  ('level-5',          'Level 5',            'Reach level 5.',                                             '{"type":"level","n":5}', 190),
  ('level-10',         'Level 10',           'Reach level 10.',                                            '{"type":"level","n":10}', 200),
  ('team-player',      'Team player',        'Join a team.',                                               '{"type":"teams_joined","n":1}', 210)
  ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------- roles
GRANT SELECT, INSERT ON goal_plan TO mcq_app;
GRANT SELECT, INSERT, UPDATE ON reflection, streak_pause, season, team, team_member TO mcq_app;
GRANT DELETE ON streak_pause, team_member TO mcq_app;

COMMIT;
