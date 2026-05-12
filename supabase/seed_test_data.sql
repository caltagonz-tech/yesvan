-- Seed test data for YES Vancity
-- Run this in Supabase SQL Editor

DO $$
DECLARE
  uid uuid := 'bee090f1-05d2-4f74-8937-26d3da8b80fe';
  uni1 uuid; uni2 uuid; uni3 uuid; uni4 uuid;
  s1 uuid; s2 uuid; s3 uuid; s4 uuid; s5 uuid; s6 uuid; s7 uuid; s8 uuid;
  h1 uuid; h2 uuid; h3 uuid; h4 uuid;
  d1 uuid; d2 uuid; d3 uuid;
  pd_academic uuid; pd_homestay uuid;
BEGIN

-- ========== UNIVERSITIES ==========
INSERT INTO public.universities (name, city, province, contact_name, contact_email, commission_scheme, notes, created_by)
VALUES
  ('Vancouver Community College', 'Vancouver', 'BC', 'Sarah Chen', 'admissions@vcc.ca', 'net_tuition', 'Main partner for ESL programs', uid),
  ('Langara College', 'Vancouver', 'BC', 'David Park', 'international@langara.ca', 'fixed_per_student', 'Strong arts and sciences', uid),
  ('ILAC Vancouver', 'Vancouver', 'BC', 'Maria Gonzalez', 'partners@ilac.com', 'percentage', 'Largest ESL school in Canada', uid),
  ('Cornerstone College', 'Vancouver', 'BC', 'James Liu', 'agents@ciccc.ca', 'percentage', 'Tech diploma programs', uid);

SELECT id INTO uni1 FROM public.universities WHERE name = 'Vancouver Community College' LIMIT 1;
SELECT id INTO uni2 FROM public.universities WHERE name = 'Langara College' LIMIT 1;
SELECT id INTO uni3 FROM public.universities WHERE name = 'ILAC Vancouver' LIMIT 1;
SELECT id INTO uni4 FROM public.universities WHERE name = 'Cornerstone College' LIMIT 1;

-- ========== STUDENTS ==========
INSERT INTO public.students (first_name, last_name, email, phone, country_of_origin, program, intake, stage, english_level, education_level, area_of_study, preferred_city, school_id, referred_by, admin_fee, tuition_gross, commission, commission_pending, projected_quarter, assigned_to, pr_intent, notes, created_by)
VALUES
  ('Camila', 'Rodriguez', 'camila.r@email.com', '+56 9 1234 5678', 'Chile', 'ESL Pathway', 'Sep 2026', 'enrolled', 'B1', 'High school', 'Business', 'Vancouver', uni3, 'Agency Santiago', 250, 8500, 1275, 1275, '2026-Q3', uid, true, 'Needs custodianship - under 19', uid),
  ('Mateo', 'Fernandez', 'mateo.f@email.com', '+54 11 5555 4444', 'Argentina', 'Web Development Diploma', 'Jan 2026', 'enrolled', 'B2', 'University', 'Computer Science', 'Vancouver', uni4, 'Direct inquiry', 250, 12000, 1800, 0, '2026-Q1', uid, true, 'Study permit approved', uid),
  ('Valentina', 'Lopez', 'val.lopez@email.com', '+52 55 8888 7777', 'Mexico', 'ESL General', 'Mar 2026', 'enrolled', 'A2', 'High school', 'Tourism', 'Vancouver', uni3, 'Agency CDMX', 250, 6000, 900, 900, '2026-Q1', uid, false, 'Short program - 3 months', uid),
  ('Santiago', 'Morales', 'santi.m@email.com', '+57 300 123 4567', 'Colombia', 'Business Management', 'Sep 2026', 'application_sent', 'B2', 'University', 'Business', 'Vancouver', uni2, 'Agency Bogota', 250, 15000, 2250, 2250, '2026-Q3', uid, true, 'Waiting for LOA', uid),
  ('Isabella', 'Herrera', 'isa.h@email.com', '+55 21 9999 8888', 'Brazil', 'ESL Academic', 'May 2026', 'enrolled', 'B1', 'University', 'Marketing', 'Vancouver', uni1, 'Agency Rio', 250, 7200, 1080, 1080, '2026-Q2', uid, false, 'Arriving May 15', uid),
  ('Lucas', 'Silva', 'lucas.s@email.com', '+55 11 7777 6666', 'Brazil', 'Hospitality Diploma', 'Jan 2026', 'enrolled', 'B2', 'University', 'Hospitality', 'Vancouver', uni4, 'Direct inquiry', 250, 13500, 2025, 2025, '2026-Q1', uid, true, 'Co-op placement needed', uid),
  ('Alejandra', 'Gutierrez', 'ale.g@email.com', '+52 33 5555 3333', 'Mexico', 'ESL Pathway', 'Sep 2026', 'documents_pending', 'A2', 'High school', 'Design', 'Vancouver', uni3, 'Agency Guadalajara', 250, 8500, 1275, 1275, '2026-Q3', uid, false, 'Missing English proficiency proof', uid),
  ('Diego', 'Ramirez', 'diego.r@email.com', '+56 9 8765 4321', 'Chile', 'ESL General', 'Jul 2026', 'enrolled', 'A2', 'High school', 'Engineering', 'Vancouver', uni3, 'Agency Santiago', 250, 6000, 900, 900, '2026-Q3', uid, true, 'Minor - needs custodianship', uid);

SELECT id INTO s1 FROM public.students WHERE email = 'camila.r@email.com';
SELECT id INTO s2 FROM public.students WHERE email = 'mateo.f@email.com';
SELECT id INTO s3 FROM public.students WHERE email = 'val.lopez@email.com';
SELECT id INTO s4 FROM public.students WHERE email = 'santi.m@email.com';
SELECT id INTO s5 FROM public.students WHERE email = 'isa.h@email.com';
SELECT id INTO s6 FROM public.students WHERE email = 'lucas.s@email.com';
SELECT id INTO s7 FROM public.students WHERE email = 'ale.g@email.com';
SELECT id INTO s8 FROM public.students WHERE email = 'diego.r@email.com';

-- ========== HOST FAMILIES ==========
INSERT INTO public.host_families (family_name, primary_contact_name, email, phone, address, city, capacity, family_rate, status, notes, created_by)
VALUES
  ('Thompson', 'Margaret Thompson', 'margaret.t@gmail.com', '+1 604 555 1234', '2847 Oak Street', 'Vancouver', 2, 1100, 'active', 'Experienced host. Has a dog. Near VCC campus.', uid),
  ('Nguyen', 'Linh Nguyen', 'linh.n@gmail.com', '+1 604 555 2345', '1523 Fraser Street', 'Vancouver', 3, 1000, 'active', 'Vietnamese-Canadian family. Great cook. Near Langara.', uid),
  ('Patterson', 'Robert Patterson', 'rob.p@gmail.com', '+1 604 555 3456', '4102 Cambie Street', 'Vancouver', 1, 1200, 'active', 'Single professional. Private room with ensuite. Downtown.', uid),
  ('Garcia-Wilson', 'Elena Garcia', 'elena.gw@gmail.com', '+1 604 555 4567', '891 Kingsway', 'Burnaby', 2, 950, 'active', 'Bilingual English/Spanish. Close to SkyTrain.', uid);

SELECT id INTO h1 FROM public.host_families WHERE family_name = 'Thompson';
SELECT id INTO h2 FROM public.host_families WHERE family_name = 'Nguyen';
SELECT id INTO h3 FROM public.host_families WHERE family_name = 'Patterson';
SELECT id INTO h4 FROM public.host_families WHERE family_name = 'Garcia-Wilson';

-- ========== DRIVERS ==========
INSERT INTO public.drivers (first_name, last_name, phone, email, vehicle_info, vehicle_capacity, region, status, notes, created_by)
VALUES
  ('Carlos', 'Mendez', '+1 604 555 7777', 'carlos.d@gmail.com', 'Toyota Highlander SUV', 6, 'Vancouver', 'active', 'Speaks Spanish. Reliable. Has child seat.', uid),
  ('Priya', 'Sharma', '+1 604 555 8888', 'priya.s@gmail.com', 'Honda Odyssey Minivan', 7, 'Vancouver', 'active', 'Can fit 6 passengers + luggage', uid),
  ('Tom', 'Baker', '+1 778 555 9999', 'tom.b@gmail.com', 'Toyota Camry Sedan', 4, 'Burnaby', 'active', 'Available evenings and weekends only', uid);

SELECT id INTO d1 FROM public.drivers WHERE email = 'carlos.d@gmail.com';
SELECT id INTO d2 FROM public.drivers WHERE email = 'priya.s@gmail.com';
SELECT id INTO d3 FROM public.drivers WHERE email = 'tom.b@gmail.com';

-- ========== HOMESTAYS ==========
INSERT INTO public.homestays (student_id, host_id, arrival_date, departure_date, status, homestay_fee, placement_fee, total, total_paid, code_of_conduct_signed, created_by)
VALUES
  (s1, h1, '2026-05-10', '2026-12-15', 'active', 7700, 300, 8000, 3300, true, uid),
  (s2, h3, '2026-01-05', '2026-09-30', 'active', 9900, 300, 10200, 6600, true, uid),
  (s3, h2, '2026-03-01', '2026-05-31', 'active', 3000, 300, 3300, 3300, true, uid),
  (s5, h2, '2026-05-15', '2026-11-15', 'pending', 6000, 300, 6300, 0, false, uid),
  (s8, h4, '2026-07-01', '2026-12-20', 'pending', 5700, 300, 6000, 0, false, uid);

-- ========== TRANSPORTS ==========
INSERT INTO public.transports (student_id, type, datetime, airport_code, flight_number, driver_id, has_study_permit, pickup_confirmed, status, notes, created_by)
VALUES
  (s1, 'arrival', '2026-05-10 14:30:00-07', 'YVR', 'LA 601', d1, true, true, 'completed', 'Arrived safely. Driver confirmed.', uid),
  (s5, 'arrival', '2026-05-15 18:45:00-07', 'YVR', 'AC 098', d2, false, true, 'confirmed', 'Will need study permit at immigration', uid),
  (s3, 'departure', '2026-06-01 08:00:00-07', 'YVR', 'AM 695', d3, true, false, 'pending', 'Pickup from Nguyen home at 5am', uid),
  (s8, 'arrival', '2026-07-01 11:15:00-07', 'YVR', 'LA 539', d1, false, false, 'pending', 'Minor - custodianship docs needed at border', uid),
  (s2, 'departure', '2026-09-30 16:20:00-07', 'YVR', 'AR 1303', NULL, true, false, 'pending', 'Driver not yet assigned', uid);

-- ========== PAYMENTS ==========
INSERT INTO public.payments (direction, counterparty_type, counterparty_id, amount, currency, category, status, due_date, paid_date, linked_student_id, description, notes, created_by)
VALUES
  ('incoming', 'student', s1, 8500, 'CAD', 'tuition', 'paid', '2026-04-15', '2026-04-14', s1, 'Camila tuition - ILAC', 'Full tuition paid via agency', uid),
  ('incoming', 'student', s1, 3300, 'CAD', 'homestay', 'paid', '2026-04-20', '2026-04-18', s1, 'Camila homestay 3mo advance', '3 months advance', uid),
  ('incoming', 'student', s1, 4700, 'CAD', 'homestay', 'pending', '2026-08-01', NULL, s1, 'Camila homestay balance', 'Remaining homestay balance', uid),
  ('incoming', 'student', s2, 12000, 'CAD', 'tuition', 'paid', '2025-12-01', '2025-11-28', s2, 'Mateo tuition - Cornerstone', 'Full tuition', uid),
  ('incoming', 'student', s3, 6000, 'CAD', 'tuition', 'paid', '2026-02-15', '2026-02-14', s3, 'Valentina tuition - ILAC', 'ESL 3-month program', uid),
  ('incoming', 'student', s4, 15000, 'CAD', 'tuition', 'pending', '2026-08-01', NULL, s4, 'Santiago tuition - Langara', 'Due after LOA received', uid),
  ('incoming', 'student', s5, 7200, 'CAD', 'tuition', 'pending', '2026-05-01', NULL, s5, 'Isabella tuition - VCC', 'Payment expected this week', uid),
  ('incoming', 'student', s5, 6300, 'CAD', 'homestay', 'pending', '2026-05-10', NULL, s5, 'Isabella homestay full', 'Full homestay amount', uid),
  ('incoming', 'student', s6, 13500, 'CAD', 'tuition', 'paid', '2025-12-15', '2025-12-12', s6, 'Lucas tuition - Cornerstone', 'Full tuition paid', uid),
  ('incoming', 'student', s8, 6000, 'CAD', 'tuition', 'pending', '2026-06-15', NULL, s8, 'Diego tuition - ILAC', 'Due before arrival', uid),
  ('incoming', 'student', s8, 6000, 'CAD', 'homestay', 'pending', '2026-06-20', NULL, s8, 'Diego homestay fee', 'Full homestay fee', uid),
  ('outgoing', 'university', uni3, 1275, 'CAD', 'commission', 'pending', '2026-06-30', NULL, s1, 'ILAC commission for Camila', 'ILAC commission Q3', uid),
  ('outgoing', 'university', uni4, 1800, 'CAD', 'commission', 'paid', '2026-03-15', '2026-03-14', s2, 'Cornerstone commission for Mateo', 'Cornerstone commission Q1', uid),
  ('outgoing', 'university', uni3, 900, 'CAD', 'commission', 'paid', '2026-04-30', '2026-04-28', s3, 'ILAC commission for Valentina', 'ILAC commission Q1', uid);

-- ========== POTENTIAL STUDENTS (LEADS) ==========
INSERT INTO public.potential_students (first_name, last_name, email, phone, country, contact_source, interested_in, english_level, travel_date, pipeline_stage, status, notes, created_by)
VALUES
  ('Ana', 'Torres', 'ana.t@email.com', '+52 55 1111 2222', 'Mexico', 'Instagram ad', 'ESL Pathway', 'A1', '2026-09-01', 'contacted', 'contacted', 'Very interested, low English. Wants homestay too.', uid),
  ('Pedro', 'Castillo', 'pedro.c@email.com', '+51 1 333 4444', 'Peru', 'Agency Lima', 'Business Diploma', 'B1', '2027-01-01', 'new', 'new', 'Agency sent profile. Budget around 15k CAD.', uid),
  ('Juliana', 'Souza', 'juliana.s@email.com', '+55 11 5555 6666', 'Brazil', 'Referral from Lucas Silva', 'Hospitality', 'B2', '2026-09-01', 'contacted', 'contacted', 'Friend of current student Lucas. Strong candidate.', uid),
  ('Carlos', 'Vega', 'carlos.v@email.com', '+56 2 7777 8888', 'Chile', 'Website form', 'Web Development', 'B1', '2027-01-01', 'new', 'new', 'Interested in co-op programs', uid),
  ('Maria', 'Echeverria', 'maria.e@email.com', '+57 315 999 0000', 'Colombia', 'Agency Medellin', 'ESL General', 'A2', '2026-07-01', 'proposal_sent', 'proposal_sent', 'Sent VCC and ILAC options. Waiting for response.', uid);

-- ========== QUARTERLY GOALS ==========
INSERT INTO public.quarterly_goals (quarter, category, target, actual, created_by)
VALUES
  ('2026-Q2', 'revenue', 45000, 27200, uid),
  ('2026-Q2', 'commissions', 8000, 3975, uid),
  ('2026-Q2', 'placements', 10, 6, uid)
ON CONFLICT (quarter, category) DO UPDATE SET actual = EXCLUDED.actual, target = EXCLUDED.target;

-- ========== ACTION CARDS ==========
INSERT INTO public.action_cards (category, urgency, title, context, related_student_id, status, assigned_to, source_user_id, created_by)
VALUES
  ('deadline', 'urgent', 'Isabella tuition payment overdue', 'Isabella Herrera tuition of $7,200 was due May 1. No payment received yet. Contact agency or student.', s5, 'active', uid, uid, uid),
  ('email', 'medium', 'Reply to Agency Santiago about Diego visa', 'Agency Santiago asked about Diego Ramirez visa timeline. They need an update for the parents.', s8, 'active', uid, uid, uid),
  ('process', 'medium', 'Schedule Isabella airport pickup', 'Isabella Herrera arrives May 15 on AC 098. Driver confirmed but family not yet notified.', s5, 'active', uid, uid, uid),
  ('data_check', 'low', 'Collect Alejandra English proficiency proof', 'Alejandra Gutierrez application is blocked - missing English proficiency certificate. Follow up with Agency Guadalajara.', s7, 'active', uid, uid, uid),
  ('process', 'medium', 'Send code of conduct to Garcia-Wilson family', 'Diego Ramirez is placed with Garcia-Wilson for July. Code of conduct and regulations not yet sent.', s8, 'active', uid, uid, uid),
  ('deadline', 'low', 'Track Q2 commission from ILAC', 'Expecting $1,275 commission for Camila Rodriguez placement. Invoice not yet sent.', s1, 'active', uid, uid, uid),
  ('process', 'info', 'Valentina departure coordination', 'Valentina Lopez program ends May 31. Departure June 1. Confirm driver Tom Baker for 5am pickup from Nguyen home.', s3, 'active', uid, uid, uid),
  ('email', 'urgent', 'Respond to Langara about Santiago LOA', 'Langara sent Santiago Morales LOA request 5 days ago. Need to confirm enrollment details and send missing transcript.', s4, 'active', uid, uid, uid);

-- ========== STUDENT PROCESS STATES ==========
SELECT id INTO pd_academic FROM public.process_definitions WHERE name = 'academic_placement' AND is_current = true LIMIT 1;
SELECT id INTO pd_homestay FROM public.process_definitions WHERE name = 'homestay_intake' AND is_current = true LIMIT 1;

IF pd_academic IS NOT NULL THEN
  INSERT INTO public.student_process_state (student_id, process_definition_id, process_name, current_step_order, completed_steps, status, assigned_to, created_by, updated_by)
  VALUES
    (s1, pd_academic, 'academic_placement', 7, ARRAY[1,2,3,4,5,6], 'in_progress', uid, uid, uid),
    (s2, pd_academic, 'academic_placement', 9, ARRAY[1,2,3,4,5,6,7,8], 'in_progress', uid, uid, uid),
    (s3, pd_academic, 'academic_placement', 9, ARRAY[1,2,3,4,5,6,7,8,9], 'completed', uid, uid, uid),
    (s4, pd_academic, 'academic_placement', 5, ARRAY[1,2,3,4], 'in_progress', uid, uid, uid),
    (s5, pd_academic, 'academic_placement', 6, ARRAY[1,2,3,4,5], 'in_progress', uid, uid, uid),
    (s7, pd_academic, 'academic_placement', 4, ARRAY[1,2,3], 'in_progress', uid, uid, uid);
END IF;

IF pd_homestay IS NOT NULL THEN
  INSERT INTO public.student_process_state (student_id, process_definition_id, process_name, current_step_order, completed_steps, status, assigned_to, created_by, updated_by)
  VALUES
    (s1, pd_homestay, 'homestay_intake', 13, ARRAY[1,2,3,4,5,6,7,8,9,10,11,12], 'in_progress', uid, uid, uid),
    (s3, pd_homestay, 'homestay_intake', 15, ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13,14], 'in_progress', uid, uid, uid),
    (s5, pd_homestay, 'homestay_intake', 5, ARRAY[1,2,3,4], 'in_progress', uid, uid, uid),
    (s8, pd_homestay, 'homestay_intake', 3, ARRAY[1,2], 'in_progress', uid, uid, uid);
END IF;

-- ========== HOST AVAILABILITY ==========
INSERT INTO public.host_availability (host_id, available_from, available_to, notes, created_by)
VALUES
  (h1, '2026-01-01', '2026-12-31', 'Available all year. Max 2 students.', uid),
  (h2, '2026-01-01', '2026-12-31', 'One spot opening June after Valentina leaves.', uid),
  (h3, '2026-01-01', '2026-09-30', 'Travelling Oct-Dec. Single student only.', uid),
  (h4, '2026-06-01', '2026-12-31', 'Available from June. New host family.', uid);

-- ========== DRIVER AVAILABILITY ==========
INSERT INTO public.driver_availability (driver_id, available_date, notes, created_by)
VALUES
  (d1, '2026-05-15', 'Available for Isabella pickup', uid),
  (d1, '2026-07-01', 'Available for Diego pickup', uid),
  (d2, '2026-05-15', 'Backup for Isabella if Carlos unavailable', uid),
  (d3, '2026-06-01', 'Confirmed for Valentina departure', uid);

RAISE NOTICE 'Seed data inserted successfully!';
END $$;
