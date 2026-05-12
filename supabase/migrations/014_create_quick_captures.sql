CREATE TABLE public.quick_captures (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  raw_text text NOT NULL,
  needs_review boolean DEFAULT true,
  resolved_to_card_id uuid REFERENCES public.action_cards(id),
  created_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.quick_captures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read captures"
  ON public.quick_captures FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert captures"
  ON public.quick_captures FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
