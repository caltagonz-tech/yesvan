-- Smart checklists: per-step runtime data (linked entities, emails, decisions)
CREATE TABLE public.process_step_data (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  process_state_id uuid NOT NULL REFERENCES public.student_process_state(id) ON DELETE CASCADE,
  step_order integer NOT NULL,

  -- Step completion metadata
  completed_at timestamptz,
  completed_by uuid REFERENCES public.users(id),
  skipped boolean DEFAULT false,
  skip_reason text,

  -- Linked entities: [{"type": "driver", "id": "uuid", "display_id": "DRV-01", "label": "Assigned driver"}, ...]
  linked_entities jsonb DEFAULT '[]',

  -- Email storage: [{"draft_to": "", "draft_subject": "", "draft_body": "", "sent_at": null, "sent_by": null}]
  emails jsonb DEFAULT '[]',

  -- Decision data (for decision-type steps)
  decision_value text,
  decision_metadata jsonb,

  -- Notes
  notes text,

  -- Audit
  created_by uuid NOT NULL REFERENCES public.users(id),
  updated_by uuid REFERENCES public.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE (process_state_id, step_order)
);

ALTER TABLE public.process_step_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read step data"
  ON public.process_step_data FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert step data"
  ON public.process_step_data FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Authenticated can update step data"
  ON public.process_step_data FOR UPDATE TO authenticated USING (true) WITH CHECK (updated_by = auth.uid());

-- Add columns to student_process_state for branching
ALTER TABLE public.student_process_state
  ADD COLUMN IF NOT EXISTS active_branches text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS skipped_steps integer[] DEFAULT '{}';

-- Link action cards to process steps (optional bridge)
ALTER TABLE public.action_cards
  ADD COLUMN IF NOT EXISTS linked_process_state_id uuid REFERENCES public.student_process_state(id),
  ADD COLUMN IF NOT EXISTS linked_step_order integer;
