-- Partition safety. Events for a month with no partition land in event_default; creating that
-- month's partition afterwards fails. Deploys now create partitions a year ahead and the app tops
-- them up as it records events, so that shouldn't happen; if it ever does, keep those events where
-- they are (they are still read normally) and carry on, rather than failing the deploy.
CREATE OR REPLACE FUNCTION ensure_event_partition(month_start date) RETURNS void LANGUAGE plpgsql
  SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m date := date_trunc('month', month_start)::date;
  name text := format('event_%s', to_char(m, 'YYYY_MM'));
BEGIN
  IF to_regclass(name) IS NULL THEN
    BEGIN
      EXECUTE format('CREATE TABLE %I PARTITION OF event FOR VALUES FROM (%L) TO (%L)',
                     name, m, (m + interval '1 month')::date);
    EXCEPTION WHEN check_violation THEN
      RAISE WARNING 'Events for % are already in event_default; leaving them there and not creating %', to_char(m, 'YYYY-MM'), name;
    END;
  END IF;
END $$;
