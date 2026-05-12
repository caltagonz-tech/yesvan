CREATE TABLE public.host_families (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  display_id text UNIQUE NOT NULL DEFAULT ('HOST-' || lpad(nextval('public.seq_host')::text, 2, '0')),
  family_name text NOT NULL,
  primary_contact_name text,
  address text,
  city text,
  region text,
  phone text,
  email text,
  languages_spoken text[] DEFAULT '{}',
  pets text[] DEFAULT '{}',
  nearby_schools text[] DEFAULT '{}',
  number_of_rooms integer,
  capacity integer NOT NULL DEFAULT 1,
  preferences text,
  family_rate numeric(12,2),
  payment_day integer,
  invoice_status text,
  status text DEFAULT 'active',
  notes text,
  archived boolean DEFAULT false,
  created_by uuid NOT NULL REFERENCES public.users(id),
  updated_by uuid REFERENCES public.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.host_availability (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  host_id uuid NOT NULL REFERENCES public.host_families(id) ON DELETE CASCADE,
  available_from date NOT NULL,
  available_to date NOT NULL,
  notes text,
  created_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.host_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.host_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read hosts"
  ON public.host_families FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert hosts"
  ON public.host_families FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Authenticated can update hosts"
  ON public.host_families FOR UPDATE TO authenticated USING (true) WITH CHECK (updated_by = auth.uid());

CREATE POLICY "Authenticated can read host availability"
  ON public.host_availability FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert host availability"
  ON public.host_availability FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
