CREATE TABLE public.change_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  column_name text NOT NULL,
  old_value text,
  new_value text,
  changed_by uuid NOT NULL REFERENCES public.users(id),
  changed_at timestamptz DEFAULT now(),
  change_source text DEFAULT 'manual' CHECK (change_source IN ('manual', 'csv_import', 'ai_suggested'))
);

CREATE INDEX idx_change_log_lookup
  ON public.change_log (table_name, record_id, column_name, changed_at DESC);

ALTER TABLE public.change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read change log"
  ON public.change_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert change log"
  ON public.change_log FOR INSERT TO authenticated
  WITH CHECK (changed_by = auth.uid());
