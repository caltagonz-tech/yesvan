CREATE TABLE public.universities (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  display_id text UNIQUE NOT NULL DEFAULT ('UNI-' || lpad(nextval('public.seq_university')::text, 2, '0')),
  name text NOT NULL,
  city text,
  province text,
  country text DEFAULT 'Canada',
  programs text[] DEFAULT '{}',
  payment_terms text,
  commission_scheme text,
  commission_type text CHECK (commission_type IN ('net_retained', 'invoice_via_platform')),
  institution_platform_url text,
  institution_requirements text,
  contact_name text,
  contact_email text,
  contact_phone text,
  notes text,
  archived boolean DEFAULT false,
  created_by uuid NOT NULL REFERENCES public.users(id),
  updated_by uuid REFERENCES public.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.universities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read universities"
  ON public.universities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert universities"
  ON public.universities FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Authenticated can update universities"
  ON public.universities FOR UPDATE TO authenticated USING (true) WITH CHECK (updated_by = auth.uid());
