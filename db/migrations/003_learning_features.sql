-- Study guide, gamification and question writing (Solution Spec: "Gamification", "Question writing").
BEGIN;

-- ---------------------------------------------------------------- weekly goal
-- Each trainee picks their own weekly goal; weeks run Monday to Sunday, Adelaide time.
ALTER TABLE app_user ADD COLUMN weekly_goal smallint NOT NULL DEFAULT 100 CHECK (weekly_goal BETWEEN 10 AND 500);

-- ---------------------------------------------------------------- achievements
-- Definitions are records, not code, so a state can add its own without a release (tenant_id set),
-- and national ones apply to everyone (tenant_id null). Rule types are interpreted by the app
-- (packages/core/src/gamification.ts); unknown types are ignored there rather than failing.
CREATE TABLE achievement_def (
  id          text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]{2,40}$'),
  tenant_id   uuid REFERENCES tenant(id),
  title       text NOT NULL CHECK (length(title) BETWEEN 2 AND 60),
  description text NOT NULL CHECK (length(description) BETWEEN 2 AND 200),
  rule        jsonb NOT NULL CHECK (rule ? 'type' AND rule ? 'n'),
  sort        integer NOT NULL DEFAULT 100,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- First earned date is kept for good, even if a later rule change would no longer award it.
CREATE TABLE achievement_earned (
  user_id        uuid NOT NULL REFERENCES app_user(id),
  achievement_id text NOT NULL REFERENCES achievement_def(id),
  earned_at      timestamptz NOT NULL DEFAULT now(),
  seen_at        timestamptz,
  PRIMARY KEY (user_id, achievement_id)
);

INSERT INTO achievement_def (id, title, description, rule, sort) VALUES
  ('first-ten',        'First steps',          'Answer your first 10 questions.',                                         '{"type":"answered","n":10}', 10),
  ('century',          'Century',              'Answer 100 questions.',                                                   '{"type":"answered","n":100}', 20),
  ('five-hundred',     'Five hundred',         'Answer 500 questions.',                                                   '{"type":"answered","n":500}', 30),
  ('explorer',         'Explorer',             'Answer questions in 10 different learning areas.',                        '{"type":"areas_covered","n":10}', 40),
  ('whole-curriculum', 'Whole curriculum',     'Answer questions in all 25 core learning areas.',                         '{"type":"areas_covered","n":25}', 50),
  ('solid-ground',     'Solid ground',         'Reach "Secure" or better in 5 learning areas.',                           '{"type":"areas_secure","n":5}', 60),
  ('sure-and-right',   'Sure and right',       'Get 10 answers in a row right that you rated fairly sure or certain.',    '{"type":"confident_run","n":10}', 70),
  ('well-calibrated',  'Well calibrated',      'After 50 answers, have your confidence within 5 points of your accuracy.', '{"type":"calibrated","n":50,"maxBias":0.05}', 80),
  ('second-thoughts',  'Good second thoughts', 'Change 5 answers from wrong to right.',                                   '{"type":"changes_helped","n":5}', 90),
  ('turnaround',       'Turnaround',           'Get 5 questions right that you previously got wrong while sure.',         '{"type":"misconceptions_fixed","n":5}', 100),
  ('steady',           'Steady',               'Meet your weekly goal 4 weeks running.',                                  '{"type":"week_streak","n":4}', 110),
  ('marathon',         'Marathon',             'Meet your weekly goal 12 weeks running.',                                 '{"type":"week_streak","n":12}', 120),
  ('question-writer',  'Question writer',      'Submit a question you wrote for review.',                                 '{"type":"questions_submitted","n":1}', 130),
  ('published',        'Published',            'Have a question you wrote accepted into the bank.',                       '{"type":"questions_accepted","n":1}', 140);

-- ---------------------------------------------------------------- question writing
-- A trainee's or supervisor's question while it is being written and reviewed. On acceptance it
-- becomes an ordinary item + item_version (provenance trainee/supervisor) served as pretest.
CREATE TABLE draft_item (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenant(id),
  author_id        uuid NOT NULL REFERENCES app_user(id),
  author_role      text NOT NULL CHECK (author_role IN ('trainee', 'supervisor')),
  status           text NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'submitted', 'changes_requested', 'accepted', 'rejected', 'withdrawn')),
  content          jsonb NOT NULL,
  recall_declared  boolean NOT NULL DEFAULT false,   -- "written by me, not recalled from an exam"
  coaching         jsonb,                            -- latest AI coaching: {text, model, at}
  review_note      text NOT NULL DEFAULT '',
  reviewer_id      uuid REFERENCES app_user(id),
  item_id          uuid REFERENCES item(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  submitted_at     timestamptz,
  reviewed_at      timestamptz,
  CHECK (status NOT IN ('submitted', 'accepted') OR recall_declared),
  CHECK (status <> 'accepted' OR item_id IS NOT NULL)
);
CREATE INDEX draft_item_author_idx ON draft_item (author_id, updated_at DESC);
CREATE INDEX draft_item_queue_idx ON draft_item (tenant_id, status, submitted_at);

GRANT SELECT ON achievement_def TO mcq_app;
GRANT SELECT, INSERT, UPDATE ON achievement_earned, draft_item TO mcq_app;

COMMIT;
