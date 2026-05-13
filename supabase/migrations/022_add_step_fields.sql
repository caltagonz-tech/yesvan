-- Add field_values column to process_step_data for capturing form data per step
ALTER TABLE public.process_step_data
  ADD COLUMN IF NOT EXISTS field_values jsonb DEFAULT '{}';

-- Comment for documentation
COMMENT ON COLUMN public.process_step_data.field_values IS
  'Key-value pairs of data captured by the step form fields. Keys match StepField.key from the process definition.';
