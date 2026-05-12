-- Run this after the first seed script errored on action_cards
-- This inserts the remaining data: action cards, process states, availability

DO $$
DECLARE
  uid uuid := 'bee090f1-05d2-4f74-8937-26d3da8b80fe';
  s1 uuid; s2 uuid; s3 uuid; s4 uuid; s5 uuid; s7 uuid; s8 uuid;
  h1 uuid; h2 uuid; h3 uuid; h4 uuid;
  d1 uuid; d2 uuid; d3 uuid;
  pd_academic uuid; pd_homestay uuid;
BEGIN

SELECT id INTO s1 FROM public.students WHERE email = 'camila.r@email.com';
SELECT id INTO s2 FROM public.students WHERE email = 'mateo.f@email.com';
SELECT id INTO s3 FROM public.students WHERE email = 'val.lopez@email.com';
SELECT id INTO s4 FROM public.students WHERE email = 'santi.m@email.com';
SELECT id INTO s5 FROM public.students WHERE email = 'isa.h@email.com';
SELECT id INTO s7 FROM public.students WHERE email = 'ale.g@email.com';
SELECT id INTO s8 FROM public.students WHERE email = 'diego.r@email.com';

SELECT id INTO h1 FROM public.host_families WHERE family_name = 'Thompson';
SELECT id INTO h2 FROM public.host_families WHERE family_name = 'Nguyen';
SELECT id INTO h3 FROM public.host_families WHERE family_name = 'Patterson';
SELECT id INTO h4 FROM public.host_families WHERE family_name = 'Garcia-Wilson';

SELECT id INTO d1 FROM public.drivers WHERE email = 'carlos.d@gmail.com';
SELECT id INTO d2 FROM public.drivers WHERE email = 'priya.s@gmail.com';
SELECT id INTO d3 FROM public.drivers WHERE email = 'tom.b@gmail.com';

-- ========== ACTION CARDS ==========
-- category must be: deadline, email, data_check, information, process
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

RAISE NOTICE 'Remaining seed data inserted successfully!';
END $$;
