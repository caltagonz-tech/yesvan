CREATE TABLE public.action_cards (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  category text NOT NULL CHECK (category IN ('deadline', 'email', 'data_check', 'information', 'process')),
  urgency text NOT NULL CHECK (urgency IN ('urgent', 'medium', 'low', 'info')),
  title text NOT NULL,
  context text,
  related_student_id uuid REFERENCES public.students(id),
  related_entity_type text,
  related_entity_id uuid,
  assigned_to uuid REFERENCES public.users(id),
  status text DEFAULT 'active' CHECK (status IN ('active', 'snoozed', 'completed', 'dismissed')),
  snoozed_until timestamptz,
  draft_email_subject text,
  draft_email_body text,
  draft_email_to text,
  handoff_note text,
  source_user_id uuid REFERENCES public.users(id),
  created_by uuid NOT NULL REFERENCES public.users(id),
  updated_by uuid REFERENCES public.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.action_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read cards"
  ON public.action_cards FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert cards"
  ON public.action_cards FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Authenticated can update cards"
  ON public.action_cards FOR UPDATE TO authenticated USING (true) WITH CHECK (updated_by = auth.uid());
