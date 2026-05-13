-- Upgrade process definitions to v3: steps now have "fields" for data capture.
-- Each field declares what data to collect and where to write it back.

-- Academic Placement v3
UPDATE public.process_definitions SET is_current = false WHERE name = 'academic_placement' AND is_current = true;
INSERT INTO public.process_definitions (name, version, definition, is_current, created_by) VALUES (
  'academic_placement', 3,
  '{
    "steps": [
      {"order": 1, "name": "Initial profile capture", "step_type": "check", "expected_duration_days": 3, "typically_responsible": "advisor",
       "fields": [
         {"key": "english_level", "label": "English level", "type": "select", "required": true, "target_table": "students", "target_column": "english_level", "options": ["Beginner", "Intermediate", "Advanced", "Native"], "prefill_from": "student.english_level"},
         {"key": "education_level", "label": "Education level", "type": "select", "required": true, "target_table": "students", "target_column": "education_level", "options": ["High School", "Bachelor''s", "Master''s", "PhD", "Other"], "prefill_from": "student.education_level"},
         {"key": "area_of_study", "label": "Area of study", "type": "text", "required": true, "target_table": "students", "target_column": "area_of_study", "prefill_from": "student.area_of_study", "placeholder": "e.g. Computer Science, Business"},
         {"key": "preferred_city", "label": "Preferred city", "type": "text", "required": false, "target_table": "students", "target_column": "preferred_city", "prefill_from": "student.preferred_city"}
       ],
       "linked_data": [{"entity_type": "student", "relationship": "related", "label": "Student", "fields_to_show": ["display_id", "first_name", "last_name", "english_level", "education_level"]}]},

      {"order": 2, "name": "Match to candidate institutions", "step_type": "action", "expected_duration_days": 2, "typically_responsible": "advisor",
       "action_config": {"action_type": "link_entity", "label": "Search & Link Universities"},
       "linked_data": [{"entity_type": "university", "relationship": "assigned", "label": "Matched universities", "fields_to_show": ["display_id", "name", "city"]}]},

      {"order": 3, "name": "Send proposals to student/agency", "step_type": "email", "expected_duration_days": 1, "typically_responsible": "advisor",
       "action_config": {"action_type": "send_email", "label": "Send Proposals",
         "email_template": {"to_field": "manual", "subject_template": "University options for {{student.first_name}} {{student.last_name}}", "body_template": "Hello,\n\nWe have identified some great university options for {{student.first_name}} based on their profile.\n\nPlease review the attached options and let us know which ones interest you.\n\nBest regards,\nYES Vancity"}}},

      {"order": 4, "name": "Application submission", "step_type": "check", "expected_duration_days": 7, "typically_responsible": "advisor",
       "fields": [
         {"key": "passport_received", "label": "Passport copy received", "type": "boolean", "required": true},
         {"key": "transcripts_received", "label": "Transcripts received", "type": "boolean", "required": true},
         {"key": "english_proof_received", "label": "English proficiency proof received", "type": "boolean", "required": true},
         {"key": "application_date", "label": "Application submitted on", "type": "date", "required": false}
       ],
       "linked_data": [{"entity_type": "university", "relationship": "assigned", "label": "Target university", "fields_to_show": ["display_id", "name"]}]},

      {"order": 5, "name": "Track institution response", "step_type": "check", "expected_duration_days": 14, "typically_responsible": "advisor",
       "fields": [
         {"key": "response_status", "label": "Response status", "type": "select", "required": false, "options": ["Waiting", "Accepted", "Waitlisted", "Rejected"]},
         {"key": "response_date", "label": "Response date", "type": "date", "required": false}
       ]},

      {"order": 6, "name": "Acceptance received - confirm enrollment", "step_type": "check", "expected_duration_days": 3, "typically_responsible": "advisor",
       "fields": [
         {"key": "accepted_university", "label": "Accepted university", "type": "entity_picker", "required": true, "entity_type": "university"},
         {"key": "enrollment_date", "label": "Enrollment confirmed on", "type": "date", "required": false}
       ]},

      {"order": 7, "name": "Payment routing decision", "step_type": "decision", "expected_duration_days": 1, "typically_responsible": "advisor",
       "notes": "Student pays agency vs institution direct",
       "conditions": [{"if": "pays_agency", "then": "continue"}, {"if": "pays_institution", "then": "continue"}]},

      {"order": 8, "name": "Commission handling", "step_type": "check", "expected_duration_days": 5, "typically_responsible": "advisor",
       "fields": [
         {"key": "commission_amount", "label": "Commission amount", "type": "number", "required": true, "placeholder": "e.g. 1500"},
         {"key": "commission_type", "label": "Commission type", "type": "select", "required": false, "options": ["NET", "Invoice via platform"]}
       ],
       "linked_data": [{"entity_type": "payment", "relationship": "related", "label": "Commission payment", "fields_to_show": ["amount", "status", "due_date"]}]},

      {"order": 9, "name": "Commission receipt tracking", "step_type": "check", "expected_duration_days": 30, "typically_responsible": "advisor",
       "fields": [
         {"key": "receipt_confirmed", "label": "Receipt confirmed", "type": "boolean", "required": true},
         {"key": "receipt_date", "label": "Date received", "type": "date", "required": false}
       ],
       "linked_data": [{"entity_type": "payment", "relationship": "related", "label": "Commission", "fields_to_show": ["amount", "status", "paid_date"]}]}
    ]
  }'::jsonb,
  true, 'bee090f1-05d2-4f74-8937-26d3da8b80fe'
) ON CONFLICT DO NOTHING;


-- Homestay Intake v3
UPDATE public.process_definitions SET is_current = false WHERE name = 'homestay_intake' AND is_current = true;
INSERT INTO public.process_definitions (name, version, definition, is_current, created_by) VALUES (
  'homestay_intake', 3,
  '{
    "steps": [
      {"order": 1, "name": "Agent or family contact", "step_type": "check", "expected_duration_days": 1, "typically_responsible": "coordinator",
       "fields": [
         {"key": "contact_method", "label": "Contact method", "type": "select", "required": false, "options": ["Email", "WhatsApp", "Phone", "In-person", "Agency referral"]},
         {"key": "contact_date", "label": "Date contacted", "type": "date", "required": false},
         {"key": "contact_notes", "label": "Notes", "type": "textarea", "required": false, "placeholder": "Any relevant details from first contact"}
       ]},

      {"order": 2, "name": "Form sent (passport, cover letter, photos)", "step_type": "email", "expected_duration_days": 3, "typically_responsible": "coordinator",
       "fields": [
         {"key": "passport_received", "label": "Passport received", "type": "boolean", "required": false},
         {"key": "cover_letter_received", "label": "Cover letter received", "type": "boolean", "required": false},
         {"key": "photos_received", "label": "Photos received", "type": "boolean", "required": false}
       ],
       "action_config": {"action_type": "send_email", "label": "Send Form Request",
         "email_template": {"to_field": "manual", "subject_template": "Required documents for {{student.first_name}} - homestay placement", "body_template": "Hello,\n\nTo begin the homestay placement process for {{student.first_name}} {{student.last_name}}, we need the following:\n- Copy of passport\n- Cover letter\n- Recent photos\n\nPlease send these at your earliest convenience.\n\nBest regards,\nYES Vancity"}}},

      {"order": 3, "name": "Placement fee invoice issued", "step_type": "action", "expected_duration_days": 1, "typically_responsible": "coordinator",
       "fields": [
         {"key": "invoice_amount", "label": "Invoice amount ($)", "type": "number", "required": true, "placeholder": "e.g. 300"},
         {"key": "invoice_date", "label": "Invoice date", "type": "date", "required": false}
       ],
       "action_config": {"action_type": "create_record", "label": "Create Invoice"},
       "linked_data": [{"entity_type": "payment", "relationship": "created_by_step", "label": "Placement fee", "fields_to_show": ["amount", "status", "due_date"]}]},

      {"order": 4, "name": "Placement fee payment received", "step_type": "check", "expected_duration_days": 7, "typically_responsible": "coordinator",
       "fields": [
         {"key": "payment_confirmed", "label": "Payment confirmed", "type": "boolean", "required": true},
         {"key": "payment_date", "label": "Date received", "type": "date", "required": false},
         {"key": "payment_method", "label": "Payment method", "type": "select", "required": false, "options": ["Bank transfer", "Credit card", "Cash", "E-transfer", "Other"]}
       ],
       "linked_data": [{"entity_type": "payment", "relationship": "related", "label": "Placement fee", "fields_to_show": ["amount", "status", "paid_date"]}]},

      {"order": 5, "name": "Family search", "step_type": "action", "expected_duration_days": 7, "typically_responsible": "coordinator",
       "notes": "Filter by availability, capacity, distance to school",
       "fields": [
         {"key": "host_family_id", "label": "Assigned host family", "type": "entity_picker", "required": true, "entity_type": "host"}
       ],
       "action_config": {"action_type": "link_entity", "label": "Search & Assign Host"},
       "linked_data": [{"entity_type": "host", "relationship": "assigned", "label": "Host family", "fields_to_show": ["display_id", "family_name", "capacity", "languages"]}]},

      {"order": 6, "name": "Is student a minor?", "step_type": "decision", "expected_duration_days": 0, "typically_responsible": "coordinator",
       "conditions": [{"if": "is_minor", "then": "activate_branch", "then_branch": "custodianship"}, {"if": "is_adult", "then": "continue"}]},

      {"order": 7, "name": "Family responds - send options", "step_type": "email", "expected_duration_days": 5, "typically_responsible": "coordinator",
       "action_config": {"action_type": "send_email", "label": "Send Family Options",
         "email_template": {"to_field": "manual", "subject_template": "Host family options for {{student.first_name}}", "body_template": "Hello,\n\nWe have found host family options that match {{student.first_name}}''s needs.\n\nPlease review and let us know your preference.\n\nBest regards,\nYES Vancity"}},
       "linked_data": [{"entity_type": "host", "relationship": "assigned", "label": "Proposed host", "fields_to_show": ["family_name", "capacity", "languages"]}]},

      {"order": 8, "name": "Issue invoice for remaining fees", "step_type": "action", "expected_duration_days": 1, "typically_responsible": "coordinator",
       "fields": [
         {"key": "remaining_amount", "label": "Remaining amount ($)", "type": "number", "required": true}
       ],
       "action_config": {"action_type": "create_record", "label": "Create Invoice"},
       "linked_data": [{"entity_type": "payment", "relationship": "created_by_step", "label": "Remaining fees", "fields_to_show": ["amount", "status"]}]},

      {"order": 9, "name": "Payment received and confirmed", "step_type": "check", "expected_duration_days": 7, "typically_responsible": "coordinator",
       "fields": [
         {"key": "payment_confirmed", "label": "Payment confirmed", "type": "boolean", "required": true},
         {"key": "payment_date", "label": "Date received", "type": "date", "required": false}
       ],
       "linked_data": [{"entity_type": "payment", "relationship": "related", "label": "Payment", "fields_to_show": ["amount", "status", "paid_date"]}]},

      {"order": 10, "name": "Send homestay confirmation to host", "step_type": "email", "expected_duration_days": 1, "typically_responsible": "coordinator",
       "action_config": {"action_type": "send_email", "label": "Send Confirmation",
         "email_template": {"to_field": "host", "subject_template": "Homestay confirmation - {{student.first_name}} arriving soon", "body_template": "Dear Host Family,\n\nWe are pleased to confirm the placement of {{student.first_name}} {{student.last_name}} with your family.\n\nStudent details, allergies, and dates are attached.\n\nPlease confirm receipt.\n\nBest regards,\nYES Vancity"}},
       "linked_data": [
         {"entity_type": "host", "relationship": "assigned", "label": "Host family", "fields_to_show": ["family_name", "phone", "email"]},
         {"entity_type": "student", "relationship": "related", "label": "Student", "fields_to_show": ["display_id", "first_name", "last_name"]}
       ]},

      {"order": 11, "name": "Send code of conduct + regulations", "step_type": "email", "expected_duration_days": 2, "typically_responsible": "coordinator",
       "action_config": {"action_type": "send_email", "label": "Send Code of Conduct",
         "email_template": {"to_field": "manual", "subject_template": "Code of Conduct and Regulations", "body_template": "Hello,\n\nPlease find attached the Code of Conduct and Regulations for the homestay program.\n\nBoth {{student.first_name}} and the host family must sign and return these documents.\n\nBest regards,\nYES Vancity"}}},

      {"order": 12, "name": "Schedule airport pickup", "step_type": "action", "expected_duration_days": 3, "typically_responsible": "coordinator",
       "fields": [
         {"key": "flight_number", "label": "Flight number", "type": "text", "required": false, "placeholder": "e.g. AC842"},
         {"key": "arrival_date", "label": "Arrival date & time", "type": "date", "required": false}
       ],
       "action_config": {"action_type": "link_entity", "label": "Schedule Pickup"},
       "linked_data": [{"entity_type": "transport", "relationship": "related", "label": "Airport pickup", "fields_to_show": ["display_id", "datetime", "flight_number", "status"]}]},

      {"order": 13, "name": "Pay host 3 days after arrival", "step_type": "check", "expected_duration_days": 4, "typically_responsible": "coordinator",
       "fields": [
         {"key": "host_payment_amount", "label": "Payment amount ($)", "type": "number", "required": true},
         {"key": "host_payment_date", "label": "Date paid", "type": "date", "required": false}
       ],
       "linked_data": [{"entity_type": "payment", "relationship": "related", "label": "Host payment", "fields_to_show": ["amount", "status", "paid_date"]}]},

      {"order": 14, "name": "Monthly host payments", "step_type": "check", "expected_duration_days": 30, "typically_responsible": "coordinator", "recurring": true,
       "fields": [
         {"key": "monthly_amount", "label": "Monthly amount ($)", "type": "number", "required": false},
         {"key": "month", "label": "Month", "type": "text", "required": false, "placeholder": "e.g. October 2026"}
       ],
       "linked_data": [{"entity_type": "payment", "relationship": "related", "label": "Monthly payment", "fields_to_show": ["amount", "status"]}]},

      {"order": 15, "name": "Drop-off coordination", "step_type": "action", "expected_duration_days": 3, "typically_responsible": "coordinator",
       "fields": [
         {"key": "dropoff_date", "label": "Drop-off date", "type": "date", "required": false},
         {"key": "dropoff_driver", "label": "Driver", "type": "entity_picker", "required": false, "entity_type": "driver"}
       ],
       "action_config": {"action_type": "link_entity", "label": "Schedule Drop-off"},
       "linked_data": [{"entity_type": "transport", "relationship": "related", "label": "Drop-off", "fields_to_show": ["display_id", "datetime", "status"]}]},

      {"order": 100, "name": "Custodian letter filled", "step_type": "check", "expected_duration_days": 5, "typically_responsible": "coordinator", "branch": "custodianship",
       "fields": [
         {"key": "julieta_letter_received", "label": "Julieta letter received", "type": "boolean", "required": true},
         {"key": "parents_letter_received", "label": "Parents letter received", "type": "boolean", "required": true}
       ]},
      {"order": 101, "name": "Custodianship payment received", "step_type": "check", "expected_duration_days": 7, "typically_responsible": "coordinator", "branch": "custodianship",
       "fields": [
         {"key": "custodianship_payment_confirmed", "label": "Payment confirmed", "type": "boolean", "required": true}
       ],
       "linked_data": [{"entity_type": "payment", "relationship": "related", "label": "Custodianship fee", "fields_to_show": ["amount", "status"]}]},
      {"order": 102, "name": "Notary appointment scheduled", "step_type": "action", "expected_duration_days": 5, "typically_responsible": "coordinator", "branch": "custodianship",
       "fields": [
         {"key": "notary_date", "label": "Appointment date", "type": "date", "required": true},
         {"key": "notary_location", "label": "Location", "type": "text", "required": false}
       ],
       "action_config": {"action_type": "create_record", "label": "Schedule Notary"},
       "notes": "Batch multiple students into one appointment when possible"},
      {"order": 103, "name": "Signing completed", "step_type": "check", "expected_duration_days": 1, "typically_responsible": "coordinator", "branch": "custodianship",
       "fields": [
         {"key": "signing_date", "label": "Date signed", "type": "date", "required": true}
       ]},
      {"order": 104, "name": "Receipt sent - confirm bank payment", "step_type": "email", "expected_duration_days": 3, "typically_responsible": "coordinator", "branch": "custodianship",
       "action_config": {"action_type": "send_email", "label": "Send Receipt",
         "email_template": {"to_field": "manual", "subject_template": "Custodianship payment receipt - {{student.first_name}} {{student.last_name}}", "body_template": "Hello,\n\nPlease find attached the receipt for the custodianship payment for {{student.first_name}} {{student.last_name}}.\n\nBank confirmation typically takes 2-3 weekdays.\n\nBest regards,\nYES Vancity"}}}
    ]
  }'::jsonb,
  true, 'bee090f1-05d2-4f74-8937-26d3da8b80fe'
) ON CONFLICT DO NOTHING;


-- Airport Arrival v3
UPDATE public.process_definitions SET is_current = false WHERE name = 'airport_arrival' AND is_current = true;
INSERT INTO public.process_definitions (name, version, definition, is_current, created_by) VALUES (
  'airport_arrival', 3,
  '{
    "steps": [
      {"order": 1, "name": "Confirm pickup is booked", "step_type": "check", "expected_duration_days": 1, "typically_responsible": "coordinator",
       "linked_data": [{"entity_type": "transport", "relationship": "related", "label": "Transport", "fields_to_show": ["display_id", "datetime", "airport_code", "status"]}]},

      {"order": 2, "name": "Check if student has Study Permit", "step_type": "decision", "expected_duration_days": 1, "typically_responsible": "coordinator",
       "notes": "May delay departure due to immigration",
       "conditions": [{"if": "has_permit", "then": "continue"}, {"if": "no_permit", "then": "continue"}]},

      {"order": 3, "name": "Find nearest available driver", "step_type": "action", "expected_duration_days": 3, "typically_responsible": "coordinator",
       "fields": [
         {"key": "arrival_date", "label": "Arrival date & time", "type": "date", "required": true},
         {"key": "flight_number", "label": "Flight number", "type": "text", "required": true, "placeholder": "e.g. AC842"},
         {"key": "airport_code", "label": "Airport", "type": "select", "required": false, "options": ["YVR", "YXX", "Other"]},
         {"key": "assigned_driver", "label": "Assigned driver", "type": "entity_picker", "required": true, "entity_type": "driver"}
       ],
       "action_config": {"action_type": "link_entity", "label": "Search & Assign Driver"},
       "linked_data": [{"entity_type": "driver", "relationship": "assigned", "label": "Assigned driver", "fields_to_show": ["display_id", "first_name", "last_name", "phone"]}]},

      {"order": 4, "name": "Confirm pickup with driver", "step_type": "email", "expected_duration_days": 2, "typically_responsible": "coordinator",
       "notes": "2+ days prior, ideally 1 week",
       "action_config": {"action_type": "send_email", "label": "Confirm with Driver",
         "email_template": {"to_field": "driver", "subject_template": "Pickup confirmation - {{student.first_name}} arriving", "body_template": "Hello,\n\nPlease confirm you are available for the following airport pickup:\n\nStudent: {{student.first_name}} {{student.last_name}}\nFlight: arriving at {{transport.airport_code}}\n\nPlease reply to confirm.\n\nBest regards,\nYES Vancity"}},
       "linked_data": [{"entity_type": "driver", "relationship": "assigned", "label": "Driver", "fields_to_show": ["first_name", "last_name", "phone"]}]},

      {"order": 5, "name": "Send flight details to family, host, driver", "step_type": "email", "expected_duration_days": 1, "typically_responsible": "coordinator",
       "action_config": {"action_type": "send_email", "label": "Send Flight Details",
         "email_template": {"to_field": "manual", "subject_template": "Flight details - {{student.first_name}} arriving", "body_template": "Hello,\n\nPlease find the flight details for {{student.first_name}} {{student.last_name}}.\n\nPlease confirm receipt.\n\nBest regards,\nYES Vancity"}},
       "linked_data": [
         {"entity_type": "transport", "relationship": "related", "label": "Flight", "fields_to_show": ["flight_number", "datetime", "airport_code"]},
         {"entity_type": "host", "relationship": "assigned", "label": "Host family", "fields_to_show": ["family_name", "phone"]},
         {"entity_type": "driver", "relationship": "assigned", "label": "Driver", "fields_to_show": ["first_name", "last_name", "phone"]}
       ]},

      {"order": 6, "name": "Send student document - where to find driver", "step_type": "email", "expected_duration_days": 1, "typically_responsible": "coordinator",
       "action_config": {"action_type": "send_email", "label": "Send to Student",
         "email_template": {"to_field": "manual", "subject_template": "Your airport pickup information - Welcome to Canada!", "body_template": "Hello {{student.first_name}},\n\nWelcome to Canada! Here is your pickup information.\n\nYour driver will be waiting for you at the arrivals area.\n\nBest regards,\nYES Vancity"}}},

      {"order": 7, "name": "Contact family with approximate arrival time", "step_type": "email", "expected_duration_days": 1, "typically_responsible": "coordinator",
       "fields": [
         {"key": "estimated_arrival_time", "label": "Estimated arrival at homestay", "type": "text", "required": false, "placeholder": "e.g. 5:30 PM"}
       ],
       "action_config": {"action_type": "send_email", "label": "Notify Family",
         "email_template": {"to_field": "host", "subject_template": "{{student.first_name}} estimated arrival time", "body_template": "Hello,\n\n{{student.first_name}} is expected to arrive at your home at approximately the scheduled time.\n\nPlease let us know if you have any questions.\n\nBest regards,\nYES Vancity"}},
       "linked_data": [{"entity_type": "host", "relationship": "assigned", "label": "Host family", "fields_to_show": ["family_name", "phone"]}]},

      {"order": 8, "name": "Pay driver after trip", "step_type": "check", "expected_duration_days": 3, "typically_responsible": "coordinator",
       "fields": [
         {"key": "driver_payment_amount", "label": "Payment amount ($)", "type": "number", "required": true},
         {"key": "driver_payment_date", "label": "Date paid", "type": "date", "required": false},
         {"key": "driver_payment_method", "label": "Payment method", "type": "select", "required": false, "options": ["E-transfer", "Cash", "Bank transfer", "Other"]}
       ],
       "linked_data": [
         {"entity_type": "driver", "relationship": "assigned", "label": "Driver", "fields_to_show": ["first_name", "last_name"]},
         {"entity_type": "payment", "relationship": "created_by_step", "label": "Driver payment", "fields_to_show": ["amount", "status"]}
       ]}
    ]
  }'::jsonb,
  true, 'bee090f1-05d2-4f74-8937-26d3da8b80fe'
) ON CONFLICT DO NOTHING;


-- Airport Departure v3
UPDATE public.process_definitions SET is_current = false WHERE name = 'airport_departure' AND is_current = true;
INSERT INTO public.process_definitions (name, version, definition, is_current, created_by) VALUES (
  'airport_departure', 3,
  '{
    "steps": [
      {"order": 1, "name": "Request flight itinerary from student", "step_type": "email", "expected_duration_days": 7, "typically_responsible": "coordinator",
       "action_config": {"action_type": "send_email", "label": "Request Itinerary",
         "email_template": {"to_field": "manual", "subject_template": "Please share your return flight details - {{student.first_name}}", "body_template": "Hello {{student.first_name}},\n\nAs your departure date approaches, please send us your return flight itinerary so we can arrange your airport transport.\n\nBest regards,\nYES Vancity"}}},

      {"order": 2, "name": "Find nearest available driver", "step_type": "action", "expected_duration_days": 3, "typically_responsible": "coordinator",
       "fields": [
         {"key": "departure_date", "label": "Departure date & time", "type": "date", "required": true},
         {"key": "flight_number", "label": "Flight number", "type": "text", "required": true, "placeholder": "e.g. AC843"},
         {"key": "assigned_driver", "label": "Assigned driver", "type": "entity_picker", "required": true, "entity_type": "driver"}
       ],
       "action_config": {"action_type": "link_entity", "label": "Search & Assign Driver"},
       "linked_data": [{"entity_type": "driver", "relationship": "assigned", "label": "Assigned driver", "fields_to_show": ["display_id", "first_name", "last_name", "phone"]}]},

      {"order": 3, "name": "Confirm with driver", "step_type": "email", "expected_duration_days": 2, "typically_responsible": "coordinator",
       "action_config": {"action_type": "send_email", "label": "Confirm with Driver",
         "email_template": {"to_field": "driver", "subject_template": "Departure pickup confirmation - {{student.first_name}}", "body_template": "Hello,\n\nPlease confirm you are available for the following departure pickup for {{student.first_name}} {{student.last_name}}.\n\nBest regards,\nYES Vancity"}},
       "linked_data": [{"entity_type": "driver", "relationship": "assigned", "label": "Driver", "fields_to_show": ["first_name", "last_name", "phone"]}]},

      {"order": 4, "name": "Send flight details to family, host, driver", "step_type": "email", "expected_duration_days": 1, "typically_responsible": "coordinator",
       "action_config": {"action_type": "send_email", "label": "Send Flight Details",
         "email_template": {"to_field": "manual", "subject_template": "Departure flight details - {{student.first_name}}", "body_template": "Hello,\n\nPlease find the departure flight details for {{student.first_name}} {{student.last_name}}.\n\nBest regards,\nYES Vancity"}},
       "linked_data": [
         {"entity_type": "transport", "relationship": "related", "label": "Flight", "fields_to_show": ["flight_number", "datetime"]},
         {"entity_type": "host", "relationship": "assigned", "label": "Host", "fields_to_show": ["family_name"]},
         {"entity_type": "driver", "relationship": "assigned", "label": "Driver", "fields_to_show": ["first_name", "last_name"]}
       ]},

      {"order": 5, "name": "Pay driver after trip", "step_type": "check", "expected_duration_days": 3, "typically_responsible": "coordinator",
       "fields": [
         {"key": "driver_payment_amount", "label": "Payment amount ($)", "type": "number", "required": true},
         {"key": "driver_payment_date", "label": "Date paid", "type": "date", "required": false}
       ],
       "linked_data": [
         {"entity_type": "driver", "relationship": "assigned", "label": "Driver", "fields_to_show": ["first_name", "last_name"]},
         {"entity_type": "payment", "relationship": "created_by_step", "label": "Driver payment", "fields_to_show": ["amount", "status"]}
       ]}
    ]
  }'::jsonb,
  true, 'bee090f1-05d2-4f74-8937-26d3da8b80fe'
) ON CONFLICT DO NOTHING;


-- Custodianship v3
UPDATE public.process_definitions SET is_current = false WHERE name = 'custodianship' AND is_current = true;
INSERT INTO public.process_definitions (name, version, definition, is_current, created_by) VALUES (
  'custodianship', 3,
  '{
    "steps": [
      {"order": 1, "name": "Custodian letter filled (Julieta + parents)", "step_type": "check", "expected_duration_days": 5, "typically_responsible": "coordinator",
       "fields": [
         {"key": "julieta_letter_received", "label": "Julieta letter received", "type": "boolean", "required": true},
         {"key": "parents_letter_received", "label": "Parents letter received", "type": "boolean", "required": true}
       ]},
      {"order": 2, "name": "Payment received and confirmed", "step_type": "check", "expected_duration_days": 7, "typically_responsible": "coordinator",
       "fields": [
         {"key": "payment_confirmed", "label": "Payment confirmed", "type": "boolean", "required": true},
         {"key": "payment_amount", "label": "Amount ($)", "type": "number", "required": false}
       ],
       "linked_data": [{"entity_type": "payment", "relationship": "related", "label": "Custodianship fee", "fields_to_show": ["amount", "status", "paid_date"]}]},
      {"order": 3, "name": "Notary appointment scheduled", "step_type": "action", "expected_duration_days": 5, "typically_responsible": "coordinator",
       "fields": [
         {"key": "notary_date", "label": "Appointment date", "type": "date", "required": true},
         {"key": "notary_location", "label": "Location", "type": "text", "required": false, "placeholder": "e.g. Vancouver Notary Public"}
       ],
       "action_config": {"action_type": "create_record", "label": "Schedule Notary"},
       "notes": "Batch multiple students into one appointment when possible"},
      {"order": 4, "name": "Signing", "step_type": "check", "expected_duration_days": 1, "typically_responsible": "coordinator",
       "fields": [
         {"key": "signing_date", "label": "Date signed", "type": "date", "required": true},
         {"key": "signing_notes", "label": "Notes", "type": "textarea", "required": false}
       ]},
      {"order": 5, "name": "Receipt sent - confirm bank reflects payment", "step_type": "email", "expected_duration_days": 3, "typically_responsible": "coordinator",
       "notes": "2-3 weekdays for bank confirmation",
       "action_config": {"action_type": "send_email", "label": "Send Receipt",
         "email_template": {"to_field": "manual", "subject_template": "Custodianship payment receipt - {{student.first_name}} {{student.last_name}}", "body_template": "Hello,\n\nPlease find attached the receipt for the custodianship payment for {{student.first_name}} {{student.last_name}}.\n\nBank confirmation typically takes 2-3 weekdays.\n\nBest regards,\nYES Vancity"}}},
      {"order": 6, "name": "Ongoing custodianship monitoring", "step_type": "check", "expected_duration_days": null, "typically_responsible": "coordinator", "recurring": true,
       "fields": [
         {"key": "monitoring_notes", "label": "Monitoring notes", "type": "textarea", "required": false, "placeholder": "Any updates or concerns"}
       ]}
    ]
  }'::jsonb,
  true, 'bee090f1-05d2-4f74-8937-26d3da8b80fe'
) ON CONFLICT DO NOTHING;


-- Migrate existing student_process_state records to point to v3 definitions
UPDATE public.student_process_state sps
SET process_definition_id = pd.id
FROM public.process_definitions pd
WHERE pd.name = sps.process_name
  AND pd.is_current = true
  AND sps.process_definition_id != pd.id;
