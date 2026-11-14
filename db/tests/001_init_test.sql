-- Tests for 001_init. Run against a fresh database:  psql -v ON_ERROR_STOP=1 -f 001_init_test.sql
-- Each block raises an exception if an expectation fails.
\set QUIET on
SELECT ensure_event_partition(date '2026-10-01');
SELECT ensure_event_partition(date '2026-10-01');  -- idempotent

INSERT INTO tenant (id, slug, name, state) VALUES ('00000000-0000-0000-0000-000000000001', 'sa', 'South Australia', 'SA');
INSERT INTO app_user (id, tenant_id, roles) VALUES ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001', ARRAY['trainee']);
INSERT INTO user_profile VALUES ('00000000-0000-0000-0000-0000000000a1', 'Trainee@Example.org', 'Test Trainee');

-- Email uniqueness ignores case
DO $$ BEGIN
  BEGIN
    INSERT INTO app_user (id, tenant_id) VALUES ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000001');
    INSERT INTO user_profile VALUES ('00000000-0000-0000-0000-0000000000a2', 'trainee@example.org', 'Dup');
    RAISE EXCEPTION 'FAIL: duplicate email accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;

-- Bad role rejected
DO $$ BEGIN
  BEGIN
    INSERT INTO app_user (tenant_id, roles) VALUES ('00000000-0000-0000-0000-000000000001', ARRAY['superuser']);
    RAISE EXCEPTION 'FAIL: bad role accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;

INSERT INTO item (id, status, calibration_core) VALUES ('11111111-1111-1111-1111-111111111111', 'pretest', true);
INSERT INTO item_version (item_id, version, stem, lead_in, options, key, explanations, learning_point,
  learning_area, domains, presentation, context, cognitive_level, patient, target_difficulty, provenance)
VALUES ('11111111-1111-1111-1111-111111111111', 1, 'A 34-year-old man ...', 'What is the most appropriate immediate treatment?',
  '[{"id":"A","text":"IM adrenaline"},{"id":"B","text":"IV adrenaline 1 mg"},{"id":"C","text":"Promethazine"},{"id":"D","text":"Hydrocortisone"}]',
  'A', '{"A":"a","B":"b","C":"c","D":"d"}', 'IM adrenaline first.', 'Emergency', ARRAY['D4'], 'anaphylaxis', 'clinic',
  'management', '{"age_band":"25-44","sex":"male","indigenous":false}', 2, 'ai_edited_by_human');

-- Item versions are immutable
DO $$ BEGIN
  BEGIN
    UPDATE item_version SET key = 'B';
    RAISE EXCEPTION 'FAIL: item_version update allowed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
END $$;

-- Lead-in must be a question; options must be 4
DO $$ BEGIN
  BEGIN
    INSERT INTO item_version (item_id, version, stem, lead_in, options, key, explanations, learning_point,
      learning_area, domains, presentation, context, cognitive_level, patient, target_difficulty, provenance)
    VALUES ('11111111-1111-1111-1111-111111111111', 2, 's', 'Not a question', '[{"id":"A"},{"id":"B"},{"id":"C"}]', 'A',
      '{"A":"a","B":"b","C":"c","D":"d"}', 'lp', 'Emergency', ARRAY['D4'], 'x', 'clinic', 'recall', '{}', 1, 'ai');
    RAISE EXCEPTION 'FAIL: malformed item version accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;

-- An answer submission: client claims correct=true for a wrong answer; the server must ignore the claim.
INSERT INTO event (event_id, event_type, user_id, tenant_id, session_id, client_ts, app_version, mode, payload) VALUES
 ('e0000000-0000-0000-0000-000000000001','answer_submitted','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000001',
  '5e000000-0000-0000-0000-000000000001','2026-10-24 10:00:00+10:30','web 0.1.0','learning',
  '{"item_id":"11111111-1111-1111-1111-111111111111","item_version":1,"final_option_id":"C","first_option_id":"C","final_confidence":4,"correct":true,"n_changes":0,"ms_total":40000}'),
 ('e0000000-0000-0000-0000-000000000002','answer_submitted','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000001',
  '5e000000-0000-0000-0000-000000000001','2026-10-24 10:02:00+10:30','web 0.1.0','learning',
  '{"item_id":"11111111-1111-1111-1111-111111111111","item_version":1,"final_option_id":"A","first_option_id":"C","first_confidence":2,"final_confidence":3,"n_changes":1,"change_path":"C>A","ms_total":68000,"attempt_number":2}');

DO $$ DECLARE r record; BEGIN
  SELECT * INTO r FROM answer WHERE event_id = 'e0000000-0000-0000-0000-000000000001';
  IF r.correct OR r.points <> -32 THEN RAISE EXCEPTION 'FAIL: answer 1 correct=% points=% (want false, -32)', r.correct, r.points; END IF;
  SELECT * INTO r FROM answer WHERE event_id = 'e0000000-0000-0000-0000-000000000002';
  IF NOT r.correct OR r.first_correct OR r.points <> 95 THEN RAISE EXCEPTION 'FAIL: answer 2 %', row_to_json(r); END IF;
END $$;

-- Offline re-send of the same event is de-duplicated
DO $$ BEGIN
  BEGIN
    INSERT INTO event (event_id, event_type, user_id, tenant_id, session_id, client_ts, app_version, mode, payload)
    VALUES ('e0000000-0000-0000-0000-000000000001','answer_submitted','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000001',
      '5e000000-0000-0000-0000-000000000001','2026-10-24 10:00:00+10:30','web 0.1.0','learning','{}');
    RAISE EXCEPTION 'FAIL: duplicate event accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;

-- Events are append-only
DO $$ BEGIN
  BEGIN
    DELETE FROM event;
    RAISE EXCEPTION 'FAIL: event delete allowed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
END $$;

-- Event lands in its month partition, a stray clock lands in default
INSERT INTO event (event_id, event_type, user_id, tenant_id, session_id, client_ts, app_version, mode)
VALUES ('e0000000-0000-0000-0000-000000000009','session_started','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000001',
  '5e000000-0000-0000-0000-000000000001','1999-01-01','web 0.1.0','none');
DO $$ BEGIN
  IF (SELECT count(*) FROM event_2026_10) <> 2 OR (SELECT count(*) FROM event_default) <> 1 THEN
    RAISE EXCEPTION 'FAIL: partition routing';
  END IF;
END $$;

-- Unknown item version is rejected
DO $$ BEGIN
  BEGIN
    INSERT INTO event (event_id, event_type, user_id, tenant_id, session_id, client_ts, app_version, mode, payload)
    VALUES (gen_random_uuid(),'answer_submitted','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000001',
      '5e000000-0000-0000-0000-000000000001', now(),'web 0.1.0','learning','{"item_id":"11111111-1111-1111-1111-111111111111","item_version":9,"final_option_id":"A","final_confidence":3}');
    RAISE EXCEPTION 'FAIL: unknown version accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
END $$;

-- Points table matches the Event Model spec
DO $$ BEGIN
  IF (SELECT array_agg(answer_points(true, l::smallint) ORDER BY l) FROM generate_series(1,4) l) <> ARRAY[55,80,95,100]
  OR (SELECT array_agg(answer_points(false, l::smallint) ORDER BY l) FROM generate_series(1,4) l) <> ARRAY[35,20,-5,-32] THEN
    RAISE EXCEPTION 'FAIL: points table';
  END IF;
END $$;

-- Views: first attempts only
DO $$ BEGIN
  IF (SELECT misconception FROM user_quadrants) <> 1 THEN RAISE EXCEPTION 'FAIL: quadrants'; END IF;
  IF (SELECT n FROM user_calibration_summary) <> 1 THEN RAISE EXCEPTION 'FAIL: calibration should count first attempts only'; END IF;
  IF (SELECT bias FROM user_calibration_summary) <> 0.950 THEN RAISE EXCEPTION 'FAIL: bias'; END IF;
  IF (SELECT n_responses FROM item_version_stats) <> 1 THEN RAISE EXCEPTION 'FAIL: item stats'; END IF;
END $$;

-- The app role can create this month's partition, insert events but not alter them
SET ROLE mcq_app;
SELECT ensure_event_partition(now()::date);
INSERT INTO event (event_id, event_type, user_id, tenant_id, session_id, client_ts, app_version, mode)
VALUES (gen_random_uuid(),'session_ended','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000001',
  '5e000000-0000-0000-0000-000000000001', now(),'web 0.1.0','none');
DO $$ BEGIN
  BEGIN
    DELETE FROM item_version;
    RAISE EXCEPTION 'FAIL: app role deleted item versions';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

\echo ALL TESTS PASSED
