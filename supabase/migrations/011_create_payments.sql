CREATE TABLE public.payments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  display_id text UNIQUE NOT NULL DEFAULT ('PAY-' || lpad(nextval('public.seq_payment')::text, 4, '0')),
  direction text NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  counterparty_type text NOT NULL CHECK (counterparty_type IN ('student', 'host', 'driver', 'university', 'advisor')),
  counterparty_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL,
  currency text DEFAULT 'CAD',
  due_date date,
  paid_date date,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled')),
  linked_student_id uuid REFERENCES public.students(id),
  linked_homestay_id uuid REFERENCES public.homestays(id),
  linked_transport_id uuid REFERENCES public.transports(id),
  category text CHECK (category IN ('tuition', 'commission', 'homestay', 'transport', 'admin_fee', 'placement_fee', 'notary', 'other')),
  description text,
  notes text,
  created_by uuid NOT NULL REFERENCES public.users(id),
  updated_by uuid REFERENCES public.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.payment_adjustments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  reason text NOT NULL,
  adjusted_by uuid NOT NULL REFERENCES public.users(id),
  adjusted_at timestamptz DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read payments"
  ON public.payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert payments"
  ON public.payments FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Authenticated can update payments"
  ON public.payments FOR UPDATE TO authenticated USING (true) WITH CHECK (updated_by = auth.uid());

CREATE POLICY "Authenticated can read payment adjustments"
  ON public.payment_adjustments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert payment adjustments"
  ON public.payment_adjustments FOR INSERT TO authenticated WITH CHECK (adjusted_by = auth.uid());
