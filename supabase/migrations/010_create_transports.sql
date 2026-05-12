CREATE TABLE public.transports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  display_id text UNIQUE NOT NULL DEFAULT ('TRN-' || lpad(nextval('public.seq_transport')::text, 3, '0')),
  type text NOT NULL CHECK (type IN ('arrival', 'departure')),
  student_id uuid NOT NULL REFERENCES public.students(id),
  driver_id uuid REFERENCES public.drivers(id),
  datetime timestamptz,
  airport_code text,
  flight_number text,
  has_study_permit boolean,
  pickup_confirmed boolean DEFAULT false,
  pickup_confirmed_date date,
  flight_details_sent boolean DEFAULT false,
  driver_paid boolean DEFAULT false,
  driver_payment_amount numeric(12,2),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
  notes text,
  created_by uuid NOT NULL REFERENCES public.users(id),
  updated_by uuid REFERENCES public.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.transports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read transports"
  ON public.transports FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert transports"
  ON public.transports FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Authenticated can update transports"
  ON public.transports FOR UPDATE TO authenticated USING (true) WITH CHECK (updated_by = auth.uid());
