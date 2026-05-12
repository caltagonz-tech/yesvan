CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  preferred_language text NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en', 'es')),
  energy_chip_enabled boolean DEFAULT false,
  notification_channel text DEFAULT 'push' CHECK (notification_channel IN ('push', 'whatsapp', 'telegram')),
  quiet_hours_start time,
  quiet_hours_end time,
  team_view_enabled boolean DEFAULT false,
  roundcube_host text,
  roundcube_username text,
  roundcube_password_encrypted text,
  column_preferences jsonb DEFAULT '{}',
  session_timeout_minutes integer DEFAULT 30,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read all profiles"
  ON public.users FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "Users can insert own profile"
  ON public.users FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE TABLE public.change_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  column_name text NOT NULL,
  old_value text,
  new_value text,
  changed_by uuid NOT NULL REFERENCES public.users(id),
  changed_at timestamptz DEFAULT now(),
  change_source text DEFAULT 'manual' CHECK (change_source IN ('manual', 'csv_import', 'ai_suggested'))
);

CREATE INDEX idx_change_log_lookup
  ON public.change_log (table_name, record_id, column_name, changed_at DESC);

ALTER TABLE public.change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read change log"
  ON public.change_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert change log"
  ON public.change_log FOR INSERT TO authenticated
  WITH CHECK (changed_by = auth.uid());
CREATE SEQUENCE public.seq_student START 1;
CREATE SEQUENCE public.seq_lead START 1;
CREATE SEQUENCE public.seq_university START 1;
CREATE SEQUENCE public.seq_host START 1;
CREATE SEQUENCE public.seq_driver START 1;
CREATE SEQUENCE public.seq_transport START 1;
CREATE SEQUENCE public.seq_payment START 1;
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
CREATE TABLE public.process_definitions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  definition jsonb NOT NULL,
  is_current boolean DEFAULT true,
  created_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX idx_process_current
  ON public.process_definitions (name) WHERE is_current = true;

CREATE TABLE public.student_process_state (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES public.students(id),
  process_definition_id uuid NOT NULL REFERENCES public.process_definitions(id),
  process_name text NOT NULL,
  current_step_order integer NOT NULL DEFAULT 1,
  completed_steps integer[] DEFAULT '{}',
  blocked_on text,
  assigned_to uuid REFERENCES public.users(id),
  status text DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'paused')),
  updated_by uuid REFERENCES public.users(id),
  updated_at timestamptz DEFAULT now(),
  created_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE (student_id, process_name)
);

ALTER TABLE public.process_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_process_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read process defs"
  ON public.process_definitions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert process defs"
  ON public.process_definitions FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

CREATE POLICY "Authenticated can read process state"
  ON public.student_process_state FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert process state"
  ON public.student_process_state FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Authenticated can update process state"
  ON public.student_process_state FOR UPDATE TO authenticated USING (true) WITH CHECK (updated_by = auth.uid());
CREATE TABLE public.action_cards (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  category text NOT NULL CHECK (category IN ('deadline', 'email', 'data_check', 'information', 'process')),
  urgency text NOT NULL CHECK (urgency IN ('urgent', 'medium', 'low', 'info')),
  title text NOT NULL,
  context text,
  related_student_id uuid REFERENCES public.students(id),
  related_entity_type text,
  related_entity_id uuid,
  assigned_to uuid REFERENCES public.users(id),
  status text DEFAULT 'active' CHECK (status IN ('active', 'snoozed', 'completed', 'dismissed')),
  snoozed_until timestamptz,
  draft_email_subject text,
  draft_email_body text,
  draft_email_to text,
  handoff_note text,
  source_user_id uuid REFERENCES public.users(id),
  created_by uuid NOT NULL REFERENCES public.users(id),
  updated_by uuid REFERENCES public.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.action_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read cards"
  ON public.action_cards FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert cards"
  ON public.action_cards FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Authenticated can update cards"
  ON public.action_cards FOR UPDATE TO authenticated USING (true) WITH CHECK (updated_by = auth.uid());
CREATE TABLE public.quick_captures (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  raw_text text NOT NULL,
  needs_review boolean DEFAULT true,
  resolved_to_card_id uuid REFERENCES public.action_cards(id),
  created_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.quick_captures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read captures"
  ON public.quick_captures FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert captures"
  ON public.quick_captures FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
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
CREATE TABLE public.conversation_states (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id),
  flow_type text NOT NULL,
  related_entity_id uuid,
  state jsonb NOT NULL DEFAULT '{}',
  status text DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.conversation_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own conversations"
  ON public.conversation_states FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users can insert own conversations"
  ON public.conversation_states FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own conversations"
  ON public.conversation_states FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
-- Generic audit trigger: logs each changed column to change_log
CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
RETURNS TRIGGER AS $$
DECLARE
  col text;
  old_val text;
  new_val text;
BEGIN
  -- Auto-set updated_at
  NEW.updated_at = now();

  FOR col IN
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = TG_TABLE_SCHEMA AND table_name = TG_TABLE_NAME
    AND column_name NOT IN ('id', 'created_at', 'created_by', 'updated_at', 'updated_by')
  LOOP
    EXECUTE format('SELECT ($1).%I::text', col) INTO old_val USING OLD;
    EXECUTE format('SELECT ($1).%I::text', col) INTO new_val USING NEW;

    IF old_val IS DISTINCT FROM new_val THEN
      INSERT INTO public.change_log (table_name, record_id, column_name, old_value, new_value, changed_by)
      VALUES (TG_TABLE_NAME, NEW.id, col, old_val, new_val, NEW.updated_by);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply audit trigger to all tracked tables
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN VALUES
    ('students'), ('potential_students'), ('universities'),
    ('host_families'), ('drivers'), ('homestays'),
    ('host_monthly_payments'), ('transports'), ('payments'),
    ('action_cards'), ('student_process_state'), ('quarterly_goals')
  LOOP
    EXECUTE format(
      'CREATE TRIGGER audit_%s BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn()',
      tbl, tbl
    );
  END LOOP;
END $$;
