-- Upgrade process definitions to v2 with step types, linked data, and conditional logic
-- Mark old versions as not current, insert new ones

-- Academic Placement v2
UPDATE public.process_definitions SET is_current = false WHERE name = 'academic_placement';
INSERT INTO public.process_definitions (name, version, definition, is_current, created_by) VALUES (
  'academic_placement', 2,
  '{
    "steps": [
      {"order": 1, "name": "Initial profile capture", "step_type": "check", "required_inputs": ["english_level", "education_level", "area_of_study", "preferred_city", "age", "intended_start_date", "program_duration", "pr_intent"], "expected_duration_days": 3, "typically_responsible": "advisor",
       "linked_data": [{"entity_type": "student", "relationship": "related", "label": "Student", "fields_to_show": ["display_id", "first_name", "last_name", "english_level", "education_level"]}]},
      {"order": 2, "name": "Match to candidate institutions", "step_type": "action", "expected_duration_days": 2, "typically_responsible": "advisor",
       "action_config": {"action_type": "link_entity", "label": "Search & Link Universities"},
       "linked_data": [{"entity_type": "university", "relationship": "assigned", "label": "Matched universities", "fields_to_show": ["display_id", "name", "city"]}]},
      {"order": 3, "name": "Send proposals to student/agency", "step_type": "email", "expected_duration_days": 1, "typically_responsible": "advisor",
       "action_config": {"action_type": "send_email", "label": "Send Proposals",
         "email_template": {"to_field": "manual", "subject_template": "University options for your studies in Canada", "body_template": "Hello,\n\nWe have identified some great university options for you based on your profile.\n\nPlease review the attached options and let us know which ones interest you.\n\nBest regards,\nYES Vancity"}}},
      {"order": 4, "name": "Application submission", "step_type": "check", "required_inputs": ["passport", "transcripts", "english_proficiency_proof"], "expected_duration_days": 7, "typically_responsible": "advisor",
       "linked_data": [{"entity_type": "university", "relationship": "assigned", "label": "Target university", "fields_to_show": ["display_id", "name"]}]},
      {"order": 5, "name": "Track institution response", "step_type": "check", "expected_duration_days": 14, "typically_responsible": "advisor"},
      {"order": 6, "name": "Acceptance received - confirm enrollment", "step_type": "check", "expected_duration_days": 3, "typically_responsible": "advisor"},
      {"order": 7, "name": "Payment routing decision", "step_type": "decision", "expected_duration_days": 1, "typically_responsible": "advisor",
       "notes": "Student pays agency vs institution direct",
       "conditions": [{"if": "pays_agency", "then": "continue"}, {"if": "pays_institution", "then": "continue"}]},
      {"order": 8, "name": "Commission handling", "step_type": "check", "expected_duration_days": 5, "typically_responsible": "advisor",
       "notes": "NET vs invoice via institution platform",
       "linked_data": [{"entity_type": "payment", "relationship": "related", "label": "Commission payment", "fields_to_show": ["amount", "status", "due_date"]}]},
      {"order": 9, "name": "Commission receipt tracking", "step_type": "check", "expected_duration_days": 30, "typically_responsible": "advisor",
       "linked_data": [{"entity_type": "payment", "relationship": "related", "label": "Commission", "fields_to_show": ["amount", "status", "paid_date"]}]}
    ]
  }'::jsonb,
  true, 'bee090f1-05d2-4f74-8937-26d3da8b80fe'
) ON CONFLICT DO NOTHING;

-- Homestay Intake v2
UPDATE public.process_definitions SET is_current = false WHERE name = 'homestay_intake';
INSERT INTO public.process_definitions (name, version, definition, is_current, created_by) VALUES (
  'homestay_intake', 2,
  '{
    "steps": [
      {"order": 1, "name": "Agent or family contact", "step_type": "check", "expected_duration_days": 1, "typically_responsible": "coordinator"},
      {"order": 2, "name": "Form sent (passport, cover letter, photos)", "step_type": "email", "required_inputs": ["passport", "cover_letter", "photos"], "expected_duration_days": 3, "typically_responsible": "coordinator",
       "action_config": {"action_type": "send_email", "label": "Send Form Request",
         "email_template": {"to_field": "manual", "subject_template": "Required documents for homestay placement", "body_template": "Hello,\n\nTo begin the homestay placement process, we need the following:\n- Copy of passport\n- Cover letter\n- Recent photos\n\nPlease send these at your earliest convenience.\n\nBest regards,\nYES Vancity"}}},
      {"order": 3, "name": "Placement fee invoice issued", "step_type": "action", "expected_duration_days": 1, "typically_responsible": "coordinator",
       "action_config": {"action_type": "create_record", "label": "Create Invoice"},
       "linked_data": [{"entity_type": "payment", "relationship": "created_by_step", "label": "Placement fee", "fields_to_show": ["amount", "status", "due_date"]}]},
      {"order": 4, "name": "Placement fee payment received", "step_type": "check", "expected_duration_days": 7, "typically_responsible": "coordinator",
       "linked_data": [{"entity_type": "payment", "relationship": "related", "label": "Placement fee", "fields_to_show": ["amount", "status", "paid_date"]}]},
      {"order": 5, "name": "Family search", "step_type": "action", "expected_duration_days": 7, "typically_responsible": "coordinator",
       "notes": "Filter by availability, capacity, distance to school",
       "action_config": {"action_type": "link_entity", "label": "Search & Assign Host"},
       "linked_data": [{"entity_type": "host", "relationship": "assigned", "label": "Host family", "fields_to_show": ["display_id", "family_name", "capacity", "languages"]}]},
      {"order": 6, "name": "Is student a minor?", "step_type": "decision", "expected_duration_days": 0, "typically_responsible": "coordinator",
       "conditions": [{"if": "is_minor", "then": "activate_branch", "then_branch": "custodianship"}, {"if": "is_adult", "then": "continue"}]},
      {"order": 7, "name": "Family responds - send options", "step_type": "email", "expected_duration_days": 5, "typically_responsible": "coordinator",
       "action_config": {"action_type": "send_email", "label": "Send Family Options",
         "email_template": {"to_field": "manual", "subject_template": "Host family options for your student", "body_template": "Hello,\n\nWe have found host family options that match your student''s needs.\n\nPlease review and let us know your preference.\n\nBest regards,\nYES Vancity"}},
       "linked_data": [{"entity_type": "host", "relationship": "assigned", "label": "Proposed host", "fields_to_show": ["family_name", "capacity", "languages"]}]},
      {"order": 8, "name": "Issue invoice for remaining fees", "step_type": "action", "expected_duration_days": 1, "typically_responsible": "coordinator",
       "action_config": {"action_type": "create_record", "label": "Create Invoice"},
       "linked_data": [{"entity_type": "payment", "relationship": "created_by_step", "label": "Remaining fees", "fields_to_show": ["amount", "status"]}]},
      {"order": 9, "name": "Payment received and confirmed", "step_type": "check", "expected_duration_days": 7, "typically_responsible": "coordinator",
       "linked_data": [{"entity_type": "payment", "relationship": "related", "label": "Payment", "fields_to_show": ["amount", "status", "paid_date"]}]},
      {"order": 10, "name": "Send homestay confirmation to host", "step_type": "email", "expected_duration_days": 1, "typically_responsible": "coordinator",
       "action_config": {"action_type": "send_email", "label": "Send Confirmation",
         "email_template": {"to_field": "host", "subject_template": "Homestay confirmation - student arriving soon", "body_template": "Dear Host Family,\n\nWe are pleased to confirm a student placement with your family.\n\nStudent details, allergies, and dates are attached.\n\nPlease confirm receipt.\n\nBest regards,\nYES Vancity"}},
       "linked_data": [
         {"entity_type": "host", "relationship": "assigned", "label": "Host family", "fields_to_show": ["family_name", "phone", "email"]},
         {"entity_type": "student", "relationship": "related", "label": "Student", "fields_to_show": ["display_id", "first_name", "last_name"]}
       ]},
      {"order": 11, "name": "Send code of conduct + regulations", "step_type": "email", "expected_duration_days": 2, "typically_responsible": "coordinator",
       "action_config": {"action_type": "send_email", "label": "Send Code of Conduct",
         "email_template": {"to_field": "manual", "subject_template": "Code of Conduct and Regulations", "body_template": "Hello,\n\nPlease find attached the Code of Conduct and Regulations for the homestay program.\n\nBoth the student and host family must sign and return these documents.\n\nBest regards,\nYES Vancity"}}},
      {"order": 12, "name": "Schedule airport pickup", "step_type": "action", "expected_duration_days": 3, "typically_responsible": "coordinator",
       "action_config": {"action_type": "link_entity", "label": "Schedule Pickup"},
       "linked_data": [{"entity_type": "transport", "relationship": "related", "label": "Airport pickup", "fields_to_show": ["display_id", "datetime", "flight_number", "status"]}]},
      {"order": 13, "name": "Pay host 3 days after arrival", "step_type": "check", "expected_duration_days": 4, "typically_responsible": "coordinator",
       "linked_data": [{"entity_type": "payment", "relationship": "related", "label": "Host payment", "fields_to_show": ["amount", "status", "paid_date"]}]},
      {"order": 14, "name": "Monthly host payments", "step_type": "check", "expected_duration_days": 30, "typically_responsible": "coordinator", "recurring": true,
       "linked_data": [{"entity_type": "payment", "relationship": "related", "label": "Monthly payment", "fields_to_show": ["amount", "status"]}]},
      {"order": 15, "name": "Drop-off coordination", "step_type": "action", "expected_duration_days": 3, "typically_responsible": "coordinator",
       "action_config": {"action_type": "link_entity", "label": "Schedule Drop-off"},
       "linked_data": [{"entity_type": "transport", "relationship": "related", "label": "Drop-off", "fields_to_show": ["display_id", "datetime", "status"]}]},

      {"order": 100, "name": "Custodian letter filled", "step_type": "check", "expected_duration_days": 5, "typically_responsible": "coordinator", "branch": "custodianship", "required_inputs": ["julieta_letter", "parents_letter"]},
      {"order": 101, "name": "Custodianship payment received", "step_type": "check", "expected_duration_days": 7, "typically_responsible": "coordinator", "branch": "custodianship",
       "linked_data": [{"entity_type": "payment", "relationship": "related", "label": "Custodianship fee", "fields_to_show": ["amount", "status"]}]},
      {"order": 102, "name": "Notary appointment scheduled", "step_type": "action", "expected_duration_days": 5, "typically_responsible": "coordinator", "branch": "custodianship",
       "action_config": {"action_type": "create_record", "label": "Schedule Notary"},
       "notes": "Batch multiple students into one appointment when possible"},
      {"order": 103, "name": "Signing completed", "step_type": "check", "expected_duration_days": 1, "typically_responsible": "coordinator", "branch": "custodianship"},
      {"order": 104, "name": "Receipt sent - confirm bank payment", "step_type": "email", "expected_duration_days": 3, "typically_responsible": "coordinator", "branch": "custodianship",
       "action_config": {"action_type": "send_email", "label": "Send Receipt",
         "email_template": {"to_field": "manual", "subject_template": "Custodianship payment receipt", "body_template": "Hello,\n\nPlease find attached the receipt for the custodianship payment.\n\nBank confirmation typically takes 2-3 weekdays.\n\nBest regards,\nYES Vancity"}}}
    ]
  }'::jsonb,
  true, 'bee090f1-05d2-4f74-8937-26d3da8b80fe'
) ON CONFLICT DO NOTHING;

-- Airport Arrival v2
UPDATE public.process_definitions SET is_current = false WHERE name = 'airport_arrival';
INSERT INTO public.process_definitions (name, version, definition, is_current, created_by) VALUES (
  'airport_arrival', 2,
  '{
    "steps": [
      {"order": 1, "name": "Confirm pickup is booked", "step_type": "check", "expected_duration_days": 1, "typically_responsible": "coordinator",
       "linked_data": [{"entity_type": "transport", "relationship": "related", "label": "Transport", "fields_to_show": ["display_id", "datetime", "airport_code", "status"]}]},
      {"order": 2, "name": "Check if student has Study Permit", "step_type": "decision", "expected_duration_days": 1, "typically_responsible": "coordinator",
       "notes": "May delay departure due to immigration",
       "conditions": [{"if": "has_permit", "then": "continue"}, {"if": "no_permit", "then": "continue"}]},
      {"order": 3, "name": "Find nearest available driver", "step_type": "action", "required_inputs": ["arrival_date"], "expected_duration_days": 3, "typically_responsible": "coordinator",
       "action_config": {"action_type": "link_entity", "label": "Search & Assign Driver"},
       "linked_data": [{"entity_type": "driver", "relationship": "assigned", "label": "Assigned driver", "fields_to_show": ["display_id", "first_name", "last_name", "phone"]}]},
      {"order": 4, "name": "Confirm pickup with driver", "step_type": "email", "expected_duration_days": 2, "typically_responsible": "coordinator",
       "notes": "2+ days prior, ideally 1 week",
       "action_config": {"action_type": "send_email", "label": "Confirm with Driver",
         "email_template": {"to_field": "driver", "subject_template": "Pickup confirmation - student arriving", "body_template": "Hello,\n\nPlease confirm you are available for the following airport pickup.\n\nPlease reply to confirm.\n\nBest regards,\nYES Vancity"}},
       "linked_data": [{"entity_type": "driver", "relationship": "assigned", "label": "Driver", "fields_to_show": ["first_name", "last_name", "phone"]}]},
      {"order": 5, "name": "Send flight details to family, host, driver", "step_type": "email", "required_inputs": ["flight_number", "arrival_time"], "expected_duration_days": 1, "typically_responsible": "coordinator",
       "action_config": {"action_type": "send_email", "label": "Send Flight Details",
         "email_template": {"to_field": "manual", "subject_template": "Flight details - student arriving", "body_template": "Hello,\n\nPlease find the flight details for the incoming student.\n\nPlease confirm receipt.\n\nBest regards,\nYES Vancity"}},
       "linked_data": [
         {"entity_type": "transport", "relationship": "related", "label": "Flight", "fields_to_show": ["flight_number", "datetime", "airport_code"]},
         {"entity_type": "host", "relationship": "assigned", "label": "Host family", "fields_to_show": ["family_name", "phone"]},
         {"entity_type": "driver", "relationship": "assigned", "label": "Driver", "fields_to_show": ["first_name", "last_name", "phone"]}
       ]},
      {"order": 6, "name": "Send student document - where to find driver", "step_type": "email", "expected_duration_days": 1, "typically_responsible": "coordinator",
       "action_config": {"action_type": "send_email", "label": "Send to Student",
         "email_template": {"to_field": "manual", "subject_template": "Your airport pickup information", "body_template": "Hello,\n\nWelcome to Canada! Here is your pickup information.\n\nYour driver will be waiting for you at the arrivals area.\n\nBest regards,\nYES Vancity"}}},
      {"order": 7, "name": "Contact family with approximate arrival time", "step_type": "email", "expected_duration_days": 1, "typically_responsible": "coordinator",
       "action_config": {"action_type": "send_email", "label": "Notify Family",
         "email_template": {"to_field": "manual", "subject_template": "Estimated arrival time at homestay", "body_template": "Hello,\n\nThe student is expected to arrive at your home at approximately [TIME].\n\nPlease let us know if you have any questions.\n\nBest regards,\nYES Vancity"}},
       "linked_data": [{"entity_type": "host", "relationship": "assigned", "label": "Host family", "fields_to_show": ["family_name", "phone"]}]},
      {"order": 8, "name": "Pay driver after trip", "step_type": "check", "expected_duration_days": 3, "typically_responsible": "coordinator",
       "linked_data": [
         {"entity_type": "driver", "relationship": "assigned", "label": "Driver", "fields_to_show": ["first_name", "last_name"]},
         {"entity_type": "payment", "relationship": "created_by_step", "label": "Driver payment", "fields_to_show": ["amount", "status"]}
       ]}
    ]
  }'::jsonb,
  true, 'bee090f1-05d2-4f74-8937-26d3da8b80fe'
) ON CONFLICT DO NOTHING;

-- Airport Departure v2
UPDATE public.process_definitions SET is_current = false WHERE name = 'airport_departure';
INSERT INTO public.process_definitions (name, version, definition, is_current, created_by) VALUES (
  'airport_departure', 2,
  '{
    "steps": [
      {"order": 1, "name": "Request flight itinerary from student", "step_type": "email", "expected_duration_days": 7, "typically_responsible": "coordinator",
       "action_config": {"action_type": "send_email", "label": "Request Itinerary",
         "email_template": {"to_field": "manual", "subject_template": "Please share your return flight details", "body_template": "Hello,\n\nAs your departure date approaches, please send us your return flight itinerary so we can arrange your airport transport.\n\nBest regards,\nYES Vancity"}}},
      {"order": 2, "name": "Find nearest available driver", "step_type": "action", "required_inputs": ["departure_date"], "expected_duration_days": 3, "typically_responsible": "coordinator",
       "action_config": {"action_type": "link_entity", "label": "Search & Assign Driver"},
       "linked_data": [{"entity_type": "driver", "relationship": "assigned", "label": "Assigned driver", "fields_to_show": ["display_id", "first_name", "last_name", "phone"]}]},
      {"order": 3, "name": "Confirm with driver", "step_type": "email", "expected_duration_days": 2, "typically_responsible": "coordinator",
       "action_config": {"action_type": "send_email", "label": "Confirm with Driver",
         "email_template": {"to_field": "driver", "subject_template": "Departure pickup confirmation", "body_template": "Hello,\n\nPlease confirm you are available for the following departure pickup.\n\nBest regards,\nYES Vancity"}},
       "linked_data": [{"entity_type": "driver", "relationship": "assigned", "label": "Driver", "fields_to_show": ["first_name", "last_name", "phone"]}]},
      {"order": 4, "name": "Send flight details to family, host, driver", "step_type": "email", "expected_duration_days": 1, "typically_responsible": "coordinator",
       "action_config": {"action_type": "send_email", "label": "Send Flight Details",
         "email_template": {"to_field": "manual", "subject_template": "Departure flight details", "body_template": "Hello,\n\nPlease find the departure flight details.\n\nBest regards,\nYES Vancity"}},
       "linked_data": [
         {"entity_type": "transport", "relationship": "related", "label": "Flight", "fields_to_show": ["flight_number", "datetime"]},
         {"entity_type": "host", "relationship": "assigned", "label": "Host", "fields_to_show": ["family_name"]},
         {"entity_type": "driver", "relationship": "assigned", "label": "Driver", "fields_to_show": ["first_name", "last_name"]}
       ]},
      {"order": 5, "name": "Pay driver after trip", "step_type": "check", "expected_duration_days": 3, "typically_responsible": "coordinator",
       "linked_data": [
         {"entity_type": "driver", "relationship": "assigned", "label": "Driver", "fields_to_show": ["first_name", "last_name"]},
         {"entity_type": "payment", "relationship": "created_by_step", "label": "Driver payment", "fields_to_show": ["amount", "status"]}
       ]}
    ]
  }'::jsonb,
  true, 'bee090f1-05d2-4f74-8937-26d3da8b80fe'
) ON CONFLICT DO NOTHING;

-- Custodianship v2 (standalone process, also embedded as branch in homestay)
UPDATE public.process_definitions SET is_current = false WHERE name = 'custodianship';
INSERT INTO public.process_definitions (name, version, definition, is_current, created_by) VALUES (
  'custodianship', 2,
  '{
    "steps": [
      {"order": 1, "name": "Custodian letter filled (Julieta + parents)", "step_type": "check", "required_inputs": ["julieta_letter", "parents_letter"], "expected_duration_days": 5, "typically_responsible": "coordinator"},
      {"order": 2, "name": "Payment received and confirmed", "step_type": "check", "expected_duration_days": 7, "typically_responsible": "coordinator",
       "linked_data": [{"entity_type": "payment", "relationship": "related", "label": "Custodianship fee", "fields_to_show": ["amount", "status", "paid_date"]}]},
      {"order": 3, "name": "Notary appointment scheduled", "step_type": "action", "expected_duration_days": 5, "typically_responsible": "coordinator",
       "action_config": {"action_type": "create_record", "label": "Schedule Notary"},
       "notes": "Batch multiple students into one appointment when possible"},
      {"order": 4, "name": "Signing", "step_type": "check", "expected_duration_days": 1, "typically_responsible": "coordinator"},
      {"order": 5, "name": "Receipt sent - confirm bank reflects payment", "step_type": "email", "expected_duration_days": 3, "typically_responsible": "coordinator",
       "notes": "2-3 weekdays for bank confirmation",
       "action_config": {"action_type": "send_email", "label": "Send Receipt",
         "email_template": {"to_field": "manual", "subject_template": "Custodianship payment receipt", "body_template": "Hello,\n\nPlease find attached the receipt for the custodianship payment.\n\nBank confirmation typically takes 2-3 weekdays.\n\nBest regards,\nYES Vancity"}}},
      {"order": 6, "name": "Ongoing custodianship monitoring", "step_type": "check", "expected_duration_days": null, "typically_responsible": "coordinator", "recurring": true}
    ]
  }'::jsonb,
  true, 'bee090f1-05d2-4f74-8937-26d3da8b80fe'
) ON CONFLICT DO NOTHING;
