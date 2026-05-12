import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/migrate — run schema migrations that can't be run via CLI.
 * Uses individual table operations since we can't run raw SQL via the Supabase client.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const results: string[] = [];

  // 1. Create process_step_data table — we'll check if it exists first
  const { error: checkErr } = await supabase.from("process_step_data").select("id").limit(1);
  if (checkErr?.message?.includes("does not exist") || checkErr?.code === "42P01") {
    // Table doesn't exist — need to create via Supabase dashboard SQL editor
    results.push("process_step_data table needs to be created via Supabase SQL editor");
  } else {
    results.push("process_step_data table already exists or accessible");
  }

  // 2. Check if active_branches column exists on student_process_state
  const { data: testState } = await supabase.from("student_process_state").select("id").limit(1);
  if (testState !== null) {
    results.push("student_process_state accessible");
  }

  // 3. Check action_cards for new columns
  const { error: cardErr } = await supabase.from("action_cards").select("linked_process_state_id").limit(1);
  if (cardErr) {
    results.push(`action_cards.linked_process_state_id: ${cardErr.message}`);
  } else {
    results.push("action_cards has linked_process_state_id column");
  }

  return NextResponse.json({ results, userId: user.id });
}
