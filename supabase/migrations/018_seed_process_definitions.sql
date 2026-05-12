-- Seed process definitions from Appendix A
-- These use a placeholder user ID; in production the first admin creates them

-- We'll use a function so the seed can reference auth.uid() at runtime
-- For now, these are inserted without a user reference (we'll handle this in the app)

-- Academic placement (A.1)
INSERT INTO public.process_definitions (id, name, version, definition, is_current, created_by, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'academic_placement',
  1,
  '{
    "steps": [
      {"order": 1, "name": "Initial profile capture", "required_inputs": ["english_level", "education_level", "area_of_study", "preferred_city", "age", "intended_start_date", "program_duration", "pr_intent", "pal_study_permit"], "expected_duration_days": 3, "typically_responsible": "advisor"},
      {"order": 2, "name": "Match to candidate institutions", "required_inputs": [], "expected_duration_days": 2, "typically_responsible": "advisor"},
      {"order": 3, "name": "Send proposals to student/agency", "required_inputs": [], "expected_duration_days": 1, "typically_responsible": "advisor"},
      {"order": 4, "name": "Application submission", "required_inputs": ["passport", "transcripts", "english_proficiency_proof"], "expected_duration_days": 7, "typically_responsible": "advisor"},
      {"order": 5, "name": "Track institution response", "required_inputs": [], "expected_duration_days": 14, "typically_responsible": "advisor"},
      {"order": 6, "name": "Acceptance received — confirm enrollment", "required_inputs": [], "expected_duration_days": 3, "typically_responsible": "advisor"},
      {"order": 7, "name": "Payment routing decision", "required_inputs": ["payment_method"], "expected_duration_days": 1, "typically_responsible": "advisor", "notes": "Student pays agency vs institution direct"},
      {"order": 8, "name": "Commission handling", "required_inputs": [], "expected_duration_days": 5, "typically_responsible": "advisor", "notes": "NET vs invoice via institution platform — per-institution rules"},
      {"order": 9, "name": "Commission receipt tracking", "required_inputs": [], "expected_duration_days": 30, "typically_responsible": "advisor"}
    ]
  }'::jsonb,
  true,
  '00000000-0000-0000-0000-000000000000',
  now()
)
ON CONFLICT DO NOTHING;

-- Homestay intake (A.2)
INSERT INTO public.process_definitions (id, name, version, definition, is_current, created_by, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'homestay_intake',
  1,
  '{
    "steps": [
      {"order": 1, "name": "Agent or family contact", "required_inputs": [], "expected_duration_days": 1, "typically_responsible": "coordinator"},
      {"order": 2, "name": "Form sent (passport, cover letter, photos)", "required_inputs": ["passport", "cover_letter", "photos"], "expected_duration_days": 3, "typically_responsible": "coordinator"},
      {"order": 3, "name": "Placement fee invoice issued", "required_inputs": [], "expected_duration_days": 1, "typically_responsible": "coordinator"},
      {"order": 4, "name": "Placement fee payment received and confirmed", "required_inputs": [], "expected_duration_days": 7, "typically_responsible": "coordinator"},
      {"order": 5, "name": "Family search", "required_inputs": ["availability", "capacity", "school_distance"], "expected_duration_days": 7, "typically_responsible": "coordinator", "notes": "Filter by availability, capacity, distance to school (≤50 min public transport)"},
      {"order": 6, "name": "Family responds — send options to student/agency", "required_inputs": [], "expected_duration_days": 5, "typically_responsible": "coordinator", "conditions": [{"if": "family_confirmed", "then": "continue"}, {"if": "want_another_option", "then": "repeat_step_5"}]},
      {"order": 7, "name": "Issue invoice for remaining fees", "required_inputs": [], "expected_duration_days": 1, "typically_responsible": "coordinator"},
      {"order": 8, "name": "Payment received and confirmed", "required_inputs": [], "expected_duration_days": 7, "typically_responsible": "coordinator"},
      {"order": 9, "name": "Send homestay confirmation to host", "required_inputs": ["student_contact", "allergies", "dates", "fee"], "expected_duration_days": 1, "typically_responsible": "coordinator"},
      {"order": 10, "name": "Send code of conduct + regulations", "required_inputs": [], "expected_duration_days": 2, "typically_responsible": "coordinator"},
      {"order": 11, "name": "Schedule airport pickup", "required_inputs": [], "expected_duration_days": 3, "typically_responsible": "coordinator"},
      {"order": 12, "name": "Pay host 3 days after arrival", "required_inputs": [], "expected_duration_days": 4, "typically_responsible": "coordinator"},
      {"order": 13, "name": "Monthly host payments", "required_inputs": [], "expected_duration_days": 30, "typically_responsible": "coordinator", "recurring": true},
      {"order": 14, "name": "Bimonthly student payment collection", "required_inputs": [], "expected_duration_days": 60, "typically_responsible": "coordinator", "recurring": true, "conditions": [{"if": "applicable"}]},
      {"order": 15, "name": "Drop-off coordination", "required_inputs": [], "expected_duration_days": 3, "typically_responsible": "coordinator"}
    ]
  }'::jsonb,
  true,
  '00000000-0000-0000-0000-000000000000',
  now()
)
ON CONFLICT DO NOTHING;

-- Custodianship (A.3)
INSERT INTO public.process_definitions (id, name, version, definition, is_current, created_by, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000003',
  'custodianship',
  1,
  '{
    "steps": [
      {"order": 1, "name": "Custodian letter filled (Julieta + parents)", "required_inputs": ["julieta_letter", "parents_letter"], "expected_duration_days": 5, "typically_responsible": "coordinator"},
      {"order": 2, "name": "Payment received and confirmed", "required_inputs": [], "expected_duration_days": 7, "typically_responsible": "coordinator"},
      {"order": 3, "name": "Notary appointment scheduled", "required_inputs": [], "expected_duration_days": 5, "typically_responsible": "coordinator", "notes": "Batch multiple students into one appointment when possible"},
      {"order": 4, "name": "Signing", "required_inputs": [], "expected_duration_days": 1, "typically_responsible": "coordinator"},
      {"order": 5, "name": "Receipt sent — confirm bank reflects payment", "required_inputs": [], "expected_duration_days": 3, "typically_responsible": "coordinator", "notes": "2-3 weekdays for bank confirmation"},
      {"order": 6, "name": "Ongoing custodianship monitoring", "required_inputs": [], "expected_duration_days": null, "typically_responsible": "coordinator", "recurring": true}
    ]
  }'::jsonb,
  true,
  '00000000-0000-0000-0000-000000000000',
  now()
)
ON CONFLICT DO NOTHING;

-- Airport transport - arrival (A.4)
INSERT INTO public.process_definitions (id, name, version, definition, is_current, created_by, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000004',
  'airport_arrival',
  1,
  '{
    "steps": [
      {"order": 1, "name": "Confirm pickup is booked", "required_inputs": [], "expected_duration_days": 1, "typically_responsible": "coordinator"},
      {"order": 2, "name": "Ask if student has Study Permit", "required_inputs": [], "expected_duration_days": 1, "typically_responsible": "coordinator", "notes": "May delay departure due to immigration"},
      {"order": 3, "name": "Find nearest available driver", "required_inputs": ["arrival_date"], "expected_duration_days": 3, "typically_responsible": "coordinator"},
      {"order": 4, "name": "Confirm pickup with driver", "required_inputs": [], "expected_duration_days": 2, "typically_responsible": "coordinator", "notes": "≥2 days prior, ideally 1 week"},
      {"order": 5, "name": "Send flight details to family, host, driver", "required_inputs": ["flight_number", "arrival_time"], "expected_duration_days": 1, "typically_responsible": "coordinator"},
      {"order": 6, "name": "Send student document — where to find driver", "required_inputs": [], "expected_duration_days": 1, "typically_responsible": "coordinator"},
      {"order": 7, "name": "Contact family with approximate arrival time", "required_inputs": [], "expected_duration_days": 1, "typically_responsible": "coordinator"},
      {"order": 8, "name": "Pay driver after trip", "required_inputs": [], "expected_duration_days": 3, "typically_responsible": "coordinator"}
    ]
  }'::jsonb,
  true,
  '00000000-0000-0000-0000-000000000000',
  now()
)
ON CONFLICT DO NOTHING;

-- Airport transport - departure (A.5)
INSERT INTO public.process_definitions (id, name, version, definition, is_current, created_by, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000005',
  'airport_departure',
  1,
  '{
    "steps": [
      {"order": 1, "name": "Request flight itinerary from student", "required_inputs": [], "expected_duration_days": 7, "typically_responsible": "coordinator"},
      {"order": 2, "name": "Find nearest available driver", "required_inputs": ["departure_date"], "expected_duration_days": 3, "typically_responsible": "coordinator"},
      {"order": 3, "name": "Confirm with driver", "required_inputs": [], "expected_duration_days": 2, "typically_responsible": "coordinator"},
      {"order": 4, "name": "Send flight details to family, host, driver", "required_inputs": ["flight_number", "departure_time"], "expected_duration_days": 1, "typically_responsible": "coordinator"},
      {"order": 5, "name": "Pay driver after trip", "required_inputs": [], "expected_duration_days": 3, "typically_responsible": "coordinator"}
    ]
  }'::jsonb,
  true,
  '00000000-0000-0000-0000-000000000000',
  now()
)
ON CONFLICT DO NOTHING;
