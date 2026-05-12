CREATE TABLE public.students (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  display_id text UNIQUE NOT NULL DEFAULT ('STU-' || lpad(nextval('public.seq_student')::text, 3, '0')),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone text,
  date_of_birth date,
  country_of_origin text,
  is_minor boolean DEFAULT false,
  school_id uuid REFERENCES public.universities(id),
  referred_by text,
  program text,
  intake text,
  completion_date date,
  stage text,
  next_step text,
  next_step_date date,
  admin_fee numeric(12,2),
  other_fees numeric(12,2),
  tuition_gross numeric(12,2),
  paid_by_student numeric(12,2),
  tuition_net numeric(12,2),
  commission numeric(12,2),
  commission_received numeric(12,2),
  commission_pending numeric(12,2),
  date_commission_received date,
  financial_statement text,
  projected_quarter text,
  advisor_user_id uuid REFERENCES public.users(id),
  advisor_commission_amount numeric(12,2),
  advisor_commission_paid boolean DEFAULT false,
  assigned_to uuid REFERENCES public.users(id),
  english_level text,
  education_level text,
  area_of_study text,
  preferred_city text,
  program_duration text,
  pr_intent boolean,
  pal_study_permit text,
  intended_start_date date,
  special_needs_flags text[] DEFAULT '{}',
  notes text,
  archived boolean DEFAULT false,
  created_by uuid NOT NULL REFERENCES public.users(id),
  updated_by uuid REFERENCES public.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read students"
  ON public.students FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert students"
  ON public.students FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Authenticated can update students"
  ON public.students FOR UPDATE TO authenticated USING (true) WITH CHECK (updated_by = auth.uid());
