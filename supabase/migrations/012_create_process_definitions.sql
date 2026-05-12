CREATE TABLE public.process_definitions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  definition jsonb NOT NULL,
  is_current boolean DEFAULT true,
  created_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX idx_process_current
  ON public.process_definitions (name) WHERE is_current = true;

CREATE TABLE public.student_process_state (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES public.students(id),
  process_definition_id uuid NOT NULL REFERENCES public.process_definitions(id),
  process_name text NOT NULL,
  current_step_order integer NOT NULL DEFAULT 1,
  completed_steps integer[] DEFAULT '{}',
  blocked_on text,
  assigned_to uuid REFERENCES public.users(id),
  status text DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'paused')),
  updated_by uuid REFERENCES public.users(id),
  updated_at timestamptz DEFAULT now(),
  created_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE (student_id, process_name)
);

ALTER TABLE public.process_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_process_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read process defs"
  ON public.process_definitions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert process defs"
  ON public.process_definitions FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

CREATE POLICY "Authenticated can read process state"
  ON public.student_process_state FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert process state"
  ON public.student_process_state FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Authenticated can update process state"
  ON public.student_process_state FOR UPDATE TO authenticated USING (true) WITH CHECK (updated_by = auth.uid());
