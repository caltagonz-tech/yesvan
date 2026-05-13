import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/test-setup — Run pending migrations (ai_prompt_templates table).
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const results: string[] = [];

  // Check if ai_prompt_templates table exists by trying to query it
  const { error: checkErr } = await supabase.from("ai_prompt_templates").select("key").limit(1);

  if (checkErr?.code === "42P01") {
    // Table doesn't exist — but we can't run DDL via the anon key.
    // Return the SQL the user needs to run manually in the Supabase SQL Editor.
    return NextResponse.json({
      error: "Table ai_prompt_templates does not exist. Run this SQL in the Supabase SQL Editor:",
      sql: `CREATE TABLE IF NOT EXISTS ai_prompt_templates (
  key         TEXT PRIMARY KEY,
  prompt      TEXT NOT NULL,
  updated_by  UUID REFERENCES users(id),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  created_at  TIMESTAMPTZ DEFAULT now()
);

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

ALTER TABLE ai_prompt_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_prompt_templates_select" ON ai_prompt_templates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "ai_prompt_templates_insert" ON ai_prompt_templates
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "ai_prompt_templates_update" ON ai_prompt_templates
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "ai_prompt_templates_delete" ON ai_prompt_templates
  FOR DELETE TO authenticated USING (true);`,
    }, { status: 500 });
  } else {
    results.push("ai_prompt_templates table exists");
  }

  return NextResponse.json({ results, userId: user.id, email: user.email });
}

/**
 * POST /api/test-setup — Create a test student with process states for testing the mobile flow.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const results: string[] = [];

  // 0a. Ensure auth user exists in public.users
  const { data: existingUser } = await supabase
    .from("users")
    .select("id")
    .eq("id", user.id)
    .limit(1);

  if (!existingUser?.length) {
    const { error: userErr } = await supabase.from("users").insert({
      id: user.id,
      first_name: "Carlos",
      last_name: "Admin",
    });
    if (userErr) {
      return NextResponse.json({ error: `Failed to create user: ${userErr.message}` }, { status: 500 });
    }
    results.push(`Created public.users record for ${user.id}`);
  } else {
    results.push("User already exists in public.users");
  }

  // 0b. Seed process definitions if empty
  const { data: existingDefs } = await supabase
    .from("process_definitions")
    .select("id")
    .limit(1);

  if (!existingDefs?.length) {
    // Insert a minimal academic_placement v3 definition
    const academicDef = {
      steps: [
        { order: 1, name: "Initial profile capture", step_type: "check", expected_duration_days: 3, typically_responsible: "advisor",
          fields: [
            { key: "english_level", label: "English level", type: "select", required: true, target_table: "students", target_column: "english_level", options: ["Beginner", "Intermediate", "Advanced", "Native"], prefill_from: "student.english_level" },
            { key: "education_level", label: "Education level", type: "select", required: true, target_table: "students", target_column: "education_level", options: ["High School", "Bachelor's", "Master's", "PhD", "Other"], prefill_from: "student.education_level" },
            { key: "area_of_study", label: "Area of study", type: "text", required: true, target_table: "students", target_column: "area_of_study", prefill_from: "student.area_of_study", placeholder: "e.g. Computer Science, Business" },
            { key: "preferred_city", label: "Preferred city", type: "text", required: false, target_table: "students", target_column: "preferred_city", prefill_from: "student.preferred_city" }
          ]
        },
        { order: 2, name: "Match to candidate institutions", step_type: "action", expected_duration_days: 2, typically_responsible: "advisor" },
        { order: 3, name: "Send proposals to student/agency", step_type: "email", expected_duration_days: 1, typically_responsible: "advisor",
          action_config: { action_type: "send_email", label: "Send Proposals",
            email_template: { to_field: "manual", subject_template: "University options for {{student.first_name}} {{student.last_name}}", body_template: "Hello,\n\nWe have identified some great university options for {{student.first_name}} based on their profile.\n\nPlease review the attached options and let us know which ones interest you.\n\nBest regards,\nYES Vancity" } } },
        { order: 4, name: "Application submission", step_type: "check", expected_duration_days: 7, typically_responsible: "advisor",
          fields: [
            { key: "passport_received", label: "Passport copy received", type: "boolean", required: true },
            { key: "transcripts_received", label: "Transcripts received", type: "boolean", required: true },
            { key: "english_proof_received", label: "English proof received", type: "boolean", required: true }
          ]
        },
        { order: 5, name: "Receive acceptance letter", step_type: "check", expected_duration_days: 14, typically_responsible: "advisor",
          fields: [
            { key: "response_status", label: "Response status", type: "select", required: true, options: ["Accepted", "Waitlisted", "Rejected", "Pending"] }
          ]
        },
        { order: 6, name: "Issue invoice for placement fee", step_type: "check", expected_duration_days: 2, typically_responsible: "admin",
          fields: [
            { key: "placement_fee", label: "Placement fee ($)", type: "number", required: true, placeholder: "e.g. 500" },
            { key: "payment_confirmed", label: "Payment confirmed", type: "boolean", required: false }
          ]
        },
        { order: 7, name: "Send confirmation to student", step_type: "email", expected_duration_days: 1, typically_responsible: "advisor",
          action_config: { action_type: "send_email", label: "Send Confirmation",
            email_template: { to_field: "manual", subject_template: "Enrollment confirmed — {{student.first_name}} {{student.last_name}}", body_template: "Dear {{student.first_name}},\n\nCongratulations! Your enrollment has been confirmed.\n\nBest regards,\nYES Vancity" } } },
        { order: 8, name: "Collect remaining fees", step_type: "check", expected_duration_days: 30, typically_responsible: "admin",
          fields: [
            { key: "remaining_fees", label: "Remaining amount ($)", type: "number", required: false },
            { key: "fees_paid", label: "All fees paid", type: "boolean", required: true }
          ]
        },
        { order: 9, name: "Final enrolment confirmation", step_type: "check", expected_duration_days: 1, typically_responsible: "admin" }
      ]
    };

    const homestayDef = {
      steps: [
        { order: 1, name: "Initial contact with student/agency", step_type: "check", expected_duration_days: 1, typically_responsible: "advisor",
          fields: [
            { key: "contact_method", label: "Contact method", type: "select", required: true, options: ["Email", "WhatsApp", "Phone", "In-person", "Agency referral"] }
          ]
        },
        { order: 2, name: "Collect student documents", step_type: "check", expected_duration_days: 5, typically_responsible: "advisor",
          fields: [
            { key: "passport_received", label: "Passport copy received", type: "boolean", required: true },
            { key: "cover_letter", label: "Cover letter / intro received", type: "boolean", required: false },
            { key: "photos_received", label: "Student photos received", type: "boolean", required: false }
          ]
        },
        { order: 3, name: "Issue homestay invoice", step_type: "check", expected_duration_days: 2, typically_responsible: "admin",
          fields: [
            { key: "invoice_amount", label: "Invoice amount ($)", type: "number", required: true, placeholder: "e.g. 900" },
            { key: "invoice_sent", label: "Invoice sent", type: "boolean", required: true }
          ]
        },
        { order: 4, name: "Receive homestay payment", step_type: "check", expected_duration_days: 7, typically_responsible: "admin",
          fields: [
            { key: "payment_confirmed", label: "Payment confirmed", type: "boolean", required: true }
          ]
        },
        { order: 5, name: "Match student to host family", step_type: "check", expected_duration_days: 5, typically_responsible: "advisor",
          fields: [
            { key: "host_family_id", label: "Host family", type: "entity_picker", required: true, entity_type: "host_family" }
          ]
        },
        { order: 6, name: "Send host family profile to student", step_type: "email", expected_duration_days: 1, typically_responsible: "advisor",
          action_config: { action_type: "send_email", label: "Send Profile",
            email_template: { to_field: "manual", subject_template: "Your host family — {{student.first_name}}", body_template: "Dear {{student.first_name}},\n\nWe are happy to introduce your host family!\n\nBest regards,\nYES Vancity" } } },
        { order: 7, name: "Confirm student acceptance", step_type: "check", expected_duration_days: 3, typically_responsible: "advisor",
          fields: [
            { key: "student_accepted", label: "Student accepted host family", type: "boolean", required: true }
          ]
        },
        { order: 8, name: "Collect flight details", step_type: "check", expected_duration_days: 7, typically_responsible: "advisor",
          fields: [
            { key: "flight_number", label: "Flight number", type: "text", required: true, placeholder: "e.g. AC842" },
            { key: "arrival_date", label: "Arrival date", type: "date", required: true },
            { key: "arrival_time", label: "Arrival time", type: "text", required: true, placeholder: "e.g. 3:45 PM" }
          ]
        },
        { order: 9, name: "Arrange airport pickup", step_type: "check", expected_duration_days: 3, typically_responsible: "advisor",
          fields: [
            { key: "driver_assigned", label: "Driver assigned", type: "entity_picker", required: true, entity_type: "driver" }
          ]
        },
        { order: 10, name: "Send arrival info to host family", step_type: "email", expected_duration_days: 1, typically_responsible: "advisor",
          action_config: { action_type: "send_email", label: "Notify Host",
            email_template: { to_field: "manual", subject_template: "Student arrival — {{student.first_name}} {{student.last_name}}", body_template: "Hello,\n\n{{student.first_name}} will be arriving soon.\n\nBest regards,\nYES Vancity" } } },
        { order: 11, name: "Welcome check-in after arrival", step_type: "check", expected_duration_days: 3, typically_responsible: "advisor" }
      ]
    };

    const airportArrivalDef = {
      steps: [
        { order: 1, name: "Confirm flight details", step_type: "check", expected_duration_days: 2, typically_responsible: "advisor",
          fields: [
            { key: "arrival_date", label: "Arrival date", type: "date", required: true, prefill_from: "student.arrival_date" },
            { key: "flight_number", label: "Flight number", type: "text", required: true, placeholder: "e.g. AC842" },
            { key: "airport_code", label: "Airport", type: "select", required: true, options: ["YVR", "YYJ", "YXX"] }
          ]
        },
        { order: 2, name: "Assign driver", step_type: "check", expected_duration_days: 2, typically_responsible: "advisor",
          fields: [
            { key: "assigned_driver", label: "Driver", type: "entity_picker", required: true, entity_type: "driver" }
          ]
        },
        { order: 3, name: "Notify driver with details", step_type: "email", expected_duration_days: 1, typically_responsible: "advisor",
          action_config: { action_type: "send_email", label: "Notify Driver",
            email_template: { to_field: "manual", subject_template: "Airport pickup — {{student.first_name}} {{student.last_name}}", body_template: "Hi,\n\nPlease pick up {{student.first_name}} {{student.last_name}} at the airport.\n\nBest,\nYES Vancity" } } },
        { order: 4, name: "Confirm pickup completed", step_type: "check", expected_duration_days: 1, typically_responsible: "advisor",
          fields: [
            { key: "pickup_confirmed", label: "Pickup completed", type: "boolean", required: true },
            { key: "arrival_notes", label: "Notes", type: "textarea", required: false, placeholder: "Any issues or comments" }
          ]
        },
        { order: 5, name: "Process driver payment", step_type: "check", expected_duration_days: 3, typically_responsible: "admin",
          fields: [
            { key: "driver_fee", label: "Driver fee ($)", type: "number", required: true, placeholder: "e.g. 80" },
            { key: "driver_paid", label: "Driver paid", type: "boolean", required: true }
          ]
        }
      ]
    };

    const defsToInsert = [
      { name: "academic_placement", version: 3, definition: academicDef, is_current: true, created_by: user.id },
      { name: "homestay_intake", version: 3, definition: homestayDef, is_current: true, created_by: user.id },
      { name: "airport_arrival", version: 3, definition: airportArrivalDef, is_current: true, created_by: user.id },
    ];

    for (const def of defsToInsert) {
      const { error: defErr } = await supabase.from("process_definitions").insert(def);
      if (defErr) {
        results.push(`Error inserting ${def.name}: ${defErr.message}`);
      } else {
        results.push(`Inserted process definition: ${def.name} v${def.version}`);
      }
    }
  } else {
    results.push("Process definitions already exist");
  }

  // 1. Create a new student: Sofia Martinez from Colombia
  const { data: existingStudent } = await supabase
    .from("students")
    .select("id, display_id")
    .eq("first_name", "Sofia")
    .eq("last_name", "Martinez")
    .limit(1);

  let studentId: string;
  let displayId: string;

  if (existingStudent && existingStudent.length > 0) {
    studentId = existingStudent[0].id;
    displayId = existingStudent[0].display_id;
    results.push(`Student already exists: ${displayId}`);
  } else {
    // Get next display_id
    const { data: allStudents } = await supabase
      .from("students")
      .select("display_id")
      .order("display_id", { ascending: false })
      .limit(1);

    const lastNum = allStudents?.[0]?.display_id
      ? parseInt(allStudents[0].display_id.replace("STU-", ""))
      : 0;
    displayId = `STU-${String(lastNum + 1).padStart(3, "0")}`;

    const { data: newStudent, error: studentErr } = await supabase
      .from("students")
      .insert({
        display_id: displayId,
        first_name: "Sofia",
        last_name: "Martinez",
        country_of_origin: "Colombia",
        program: "ESL Academic",
        intake: "Sep 2026",
        stage: "enrolled",
        preferred_city: "Vancouver",
        education_level: "University",
        english_level: "Intermediate",
        is_minor: true,
        created_by: user.id,
        updated_by: user.id,
      })
      .select("id")
      .single();

    if (studentErr) {
      return NextResponse.json({ error: studentErr.message }, { status: 500 });
    }
    studentId = newStudent.id;
    results.push(`Created student: ${displayId} (${studentId})`);
  }

  // 2. Get process definitions for homestay_intake and airport_arrival
  const { data: processes } = await supabase
    .from("process_definitions")
    .select("id, name, definition")
    .eq("is_current", true)
    .in("name", ["homestay_intake", "airport_arrival"]);

  if (!processes?.length) {
    return NextResponse.json({ error: "No processes found", results }, { status: 500 });
  }

  // 3. Create process states for the student
  for (const proc of processes) {
    const { data: existing } = await supabase
      .from("student_process_state")
      .select("id")
      .eq("student_id", studentId)
      .eq("process_name", proc.name)
      .limit(1);

    if (existing && existing.length > 0) {
      results.push(`Process state already exists for ${proc.name}: ${existing[0].id}`);
      continue;
    }

    // Start with first 2 steps completed to simulate some progress
    const steps = proc.definition?.steps || [];
    const completedSteps = steps.length >= 2 ? [steps[0].order, steps[1].order] : [];
    const currentStep = steps.length >= 3 ? steps[2].order : 1;

    const { data: newState, error: stateErr } = await supabase
      .from("student_process_state")
      .insert({
        student_id: studentId,
        process_definition_id: proc.id,
        process_name: proc.name,
        current_step_order: currentStep,
        completed_steps: completedSteps,
        skipped_steps: [],
        active_branches: [],
        status: "in_progress",
        created_by: user.id,
        updated_by: user.id,
      })
      .select("id")
      .single();

    if (stateErr) {
      results.push(`Error creating state for ${proc.name}: ${stateErr.message}`);
    } else {
      results.push(`Created process state for ${proc.name}: ${newState.id}`);
    }
  }

  // 4. Create some action cards for the mobile AI conversation flow
  const cards = [
    {
      category: "process",
      urgency: "medium",
      title: `Assign host family for ${displayId} Sofia Martinez`,
      context: `Sofia Martinez (${displayId}) from Colombia needs a host family in Vancouver. She starts ESL Academic in Sep 2026. She is 17 years old, so she is a minor and will need custodianship. She has no allergies and prefers a family with pets.`,
      status: "active",
      created_by: user.id,
      updated_by: user.id,
    },
    {
      category: "process",
      urgency: "medium",
      title: `Arrange airport pickup for ${displayId} Sofia Martinez`,
      context: `Sofia Martinez (${displayId}) arrives at YVR on Aug 28, 2026 at 3:45 PM, flight AC842 from Bogota via Toronto. She needs transportation from the airport to her host family in Vancouver. She speaks intermediate English.`,
      status: "active",
      created_by: user.id,
      updated_by: user.id,
    },
    {
      category: "email",
      urgency: "low",
      title: `Send welcome email to Sofia Martinez ${displayId}`,
      context: `Send a welcome email to Sofia Martinez confirming her enrollment in the ESL Academic program starting Sep 2026. Include information about her host family placement and airport pickup arrangements.`,
      status: "active",
      created_by: user.id,
      updated_by: user.id,
    },
  ];

  for (const card of cards) {
    const { data: existingCard } = await supabase
      .from("action_cards")
      .select("id")
      .eq("title", card.title)
      .limit(1);

    if (existingCard && existingCard.length > 0) {
      results.push(`Card already exists: ${card.title.substring(0, 40)}...`);
      continue;
    }

    const { error: cardErr } = await supabase.from("action_cards").insert(card);
    if (cardErr) {
      results.push(`Error creating card: ${cardErr.message}`);
    } else {
      results.push(`Created card: ${card.title.substring(0, 40)}...`);
    }
  }

  return NextResponse.json({ results, studentId, displayId });
}
