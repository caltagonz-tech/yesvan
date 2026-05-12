CREATE TABLE public.quarterly_goals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  quarter text NOT NULL,
  category text NOT NULL CHECK (category IN ('revenue', 'commissions', 'placements')),
  target numeric(12,2) NOT NULL,
  actual numeric(12,2) DEFAULT 0,
  created_by uuid NOT NULL REFERENCES public.users(id),
  updated_by uuid REFERENCES public.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (quarter, category)
);

ALTER TABLE public.quarterly_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read goals"
  ON public.quarterly_goals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert goals"
  ON public.quarterly_goals FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Authenticated can update goals"
  ON public.quarterly_goals FOR UPDATE TO authenticated USING (true) WITH CHECK (updated_by = auth.uid());
