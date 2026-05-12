CREATE TABLE public.potential_students (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  display_id text UNIQUE NOT NULL DEFAULT ('LEAD-' || lpad(nextval('public.seq_lead')::text, 3, '0')),
  contact_source text,
  contact_date date,
  first_name text,
  last_name text,
  interested_in text,
  travel_date date,
  program_type text,
  age integer,
  education_level text,
  english_level text,
  budget numeric(12,2),
  budget_currency text DEFAULT 'CAD',
  last_contact_date date,
  reminder text,
  reminder_date date,
  pipeline_stage text,
  status text,
  phone text,
  contact_method text,
  email text,
  country text,
  date_of_birth date,
  notes text,
  assigned_to uuid REFERENCES public.users(id),
  archived boolean DEFAULT false,
  created_by uuid NOT NULL REFERENCES public.users(id),
  updated_by uuid REFERENCES public.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.potential_students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read leads"
  ON public.potential_students FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert leads"
  ON public.potential_students FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Authenticated can update leads"
  ON public.potential_students FOR UPDATE TO authenticated USING (true) WITH CHECK (updated_by = auth.uid());
