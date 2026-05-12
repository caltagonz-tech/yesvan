CREATE TABLE public.drivers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  display_id text UNIQUE NOT NULL DEFAULT ('DRV-' || lpad(nextval('public.seq_driver')::text, 2, '0')),
  first_name text NOT NULL,
  last_name text NOT NULL,
  phone text,
  email text,
  vehicle_info text,
  vehicle_capacity integer,
  region text,
  status text DEFAULT 'active',
  notes text,
  archived boolean DEFAULT false,
  created_by uuid NOT NULL REFERENCES public.users(id),
  updated_by uuid REFERENCES public.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.driver_availability (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  available_date date NOT NULL,
  available boolean DEFAULT true,
  notes text,
  created_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read drivers"
  ON public.drivers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert drivers"
  ON public.drivers FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Authenticated can update drivers"
  ON public.drivers FOR UPDATE TO authenticated USING (true) WITH CHECK (updated_by = auth.uid());

CREATE POLICY "Authenticated can read driver availability"
  ON public.driver_availability FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert driver availability"
  ON public.driver_availability FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
