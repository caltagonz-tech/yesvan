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
