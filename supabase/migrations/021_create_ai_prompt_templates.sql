-- AI prompt templates: custom overrides for AI prompts
CREATE TABLE IF NOT EXISTS ai_prompt_templates (
  key         TEXT PRIMARY KEY,
  prompt      TEXT NOT NULL,
  updated_by  UUID REFERENCES users(id),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_ai_prompt_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ai_prompt_templates_updated_at
  BEFORE UPDATE ON ai_prompt_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_prompt_templates_updated_at();

-- RLS
ALTER TABLE ai_prompt_templates ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read prompts
CREATE POLICY "ai_prompt_templates_select" ON ai_prompt_templates
  FOR SELECT TO authenticated USING (true);

-- All authenticated users can insert/update/delete
CREATE POLICY "ai_prompt_templates_insert" ON ai_prompt_templates
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "ai_prompt_templates_update" ON ai_prompt_templates
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "ai_prompt_templates_delete" ON ai_prompt_templates
  FOR DELETE TO authenticated USING (true);
