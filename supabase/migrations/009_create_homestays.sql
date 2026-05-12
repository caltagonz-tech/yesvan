CREATE TABLE public.homestays (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES public.students(id),
  host_id uuid NOT NULL REFERENCES public.host_families(id),
  arrival_date date NOT NULL,
  departure_date date,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'cancelled')),
  completed_form_received boolean DEFAULT false,
  julieta_custody_letter boolean DEFAULT false,
  parents_custody_letter boolean DEFAULT false,
  custody_status text,
  placement_fee numeric(12,2),
  pickup_fee numeric(12,2),
  dropoff_fee numeric(12,2),
  both_ways_fee numeric(12,2),
  other_fees numeric(12,2),
  homestay_fee numeric(12,2),
  total numeric(12,2),
  total_paid numeric(12,2) DEFAULT 0,
  total_pending numeric(12,2),
  payment_date date,
  financial_statement text,
  code_of_conduct_signed boolean DEFAULT false,
  notes text,
  created_by uuid NOT NULL REFERENCES public.users(id),
  updated_by uuid REFERENCES public.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.host_monthly_payments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  homestay_id uuid NOT NULL REFERENCES public.homestays(id) ON DELETE CASCADE,
  host_id uuid NOT NULL REFERENCES public.host_families(id),
  month date NOT NULL,
  base_amount numeric(12,2) NOT NULL,
  adjustment_amount numeric(12,2) DEFAULT 0,
  adjustment_reason text,
  final_amount numeric(12,2) GENERATED ALWAYS AS (base_amount + adjustment_amount) STORED,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  paid_date date,
  created_by uuid NOT NULL REFERENCES public.users(id),
  updated_by uuid REFERENCES public.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.homestays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.host_monthly_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read homestays"
  ON public.homestays FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert homestays"
  ON public.homestays FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Authenticated can update homestays"
  ON public.homestays FOR UPDATE TO authenticated USING (true) WITH CHECK (updated_by = auth.uid());

CREATE POLICY "Authenticated can read host payments"
  ON public.host_monthly_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert host payments"
  ON public.host_monthly_payments FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Authenticated can update host payments"
  ON public.host_monthly_payments FOR UPDATE TO authenticated USING (true) WITH CHECK (updated_by = auth.uid());
