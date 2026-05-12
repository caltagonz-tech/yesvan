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
