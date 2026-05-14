CREATE TABLE public.feedback_comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  page_url text NOT NULL,
  element_selector text,
  element_label text,
  element_rect jsonb,
  comment text NOT NULL,
  status text DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.feedback_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read feedback"
  ON public.feedback_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert feedback"
  ON public.feedback_comments FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Authenticated can update feedback"
  ON public.feedback_comments FOR UPDATE TO authenticated USING (true) WITH CHECK (created_by = auth.uid());
CREATE POLICY "Authenticated can delete feedback"
  ON public.feedback_comments FOR DELETE TO authenticated USING (created_by = auth.uid());
