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

  return NextResponse.json({ results });
}

/**
 * POST /api/test-setup — Create a test student with process states for testing the mobile flow.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const results: string[] = [];

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
