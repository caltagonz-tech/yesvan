-- Generic audit trigger: logs each changed column to change_log
CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
RETURNS TRIGGER AS $$
DECLARE
  col text;
  old_val text;
  new_val text;
BEGIN
  -- Auto-set updated_at
  NEW.updated_at = now();

  FOR col IN
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = TG_TABLE_SCHEMA AND table_name = TG_TABLE_NAME
    AND column_name NOT IN ('id', 'created_at', 'created_by', 'updated_at', 'updated_by')
  LOOP
    EXECUTE format('SELECT ($1).%I::text', col) INTO old_val USING OLD;
    EXECUTE format('SELECT ($1).%I::text', col) INTO new_val USING NEW;

    IF old_val IS DISTINCT FROM new_val THEN
      INSERT INTO public.change_log (table_name, record_id, column_name, old_value, new_value, changed_by)
      VALUES (TG_TABLE_NAME, NEW.id, col, old_val, new_val, NEW.updated_by);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply audit trigger to all tracked tables
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN VALUES
    ('students'), ('potential_students'), ('universities'),
    ('host_families'), ('drivers'), ('homestays'),
    ('host_monthly_payments'), ('transports'), ('payments'),
    ('action_cards'), ('student_process_state'), ('quarterly_goals')
  LOOP
    EXECUTE format(
      'CREATE TRIGGER audit_%s BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn()',
      tbl, tbl
    );
  END LOOP;
END $$;
