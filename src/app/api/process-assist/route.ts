import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { buildPiiContext, anonymize, deAnonymize, type PiiContext } from "@/lib/pii";
import { DEFAULT_PROMPTS } from "@/app/api/ai-prompts/route";
import {
  type StepDefinition,
  type ProcessStepData,
  type StudentProcessState,
  resolveVisibleSteps,
  renderTemplate,
} from "@/types/process";

const anthropic = new Anthropic();

const PROCESS_LABELS: Record<string, string> = {
  academic_placement: "Academic Placement",
  homestay_intake: "Homestay Intake",
  custodianship: "Custodianship",
  airport_arrival: "Airport Arrival",
  airport_departure: "Airport Departure",
};

// Entity type → Supabase table mapping
const ENTITY_TABLE_MAP: Record<string, string> = {
  student: "students",
  host: "homestay_families",
  driver: "drivers",
  university: "universities",
  transport: "transports",
  payment: "payments",
  homestay: "homestays",
};

/**
 * Load a prompt template from DB or fallback to default.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getPrompt(supabase: any, key: string): Promise<string> {
  try {
    const { data } = await supabase
      .from("ai_prompt_templates")
      .select("prompt")
      .eq("key", key)
      .single();
    if (data?.prompt) return data.prompt;
  } catch {
    // Fall back to default
  }
  return DEFAULT_PROMPTS[key]?.prompt || "";
}

/**
 * Load PII context for anonymization.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadPiiContext(supabase: any): Promise<PiiContext> {
  const [studentsRes, hostsRes, driversRes, unisRes, usersRes] = await Promise.all([
    supabase.from("students").select("id, display_id, first_name, last_name").limit(200),
    supabase.from("homestay_families").select("id, display_id, family_name").limit(100),
    supabase.from("drivers").select("id, display_id, first_name, last_name").limit(50),
    supabase.from("universities").select("id, display_id, name").limit(50),
    supabase.from("users").select("id, first_name, last_name").limit(20),
  ]);
  return buildPiiContext(
    studentsRes.data || [],
    hostsRes.data || [],
    driversRes.data || [],
    unisRes.data || [],
    usersRes.data || [],
  );
}

/**
 * Fetch all relevant entity data for a student's process context.
 * Returns a flat map like { "student.first_name": "Sofia", "host.family_name": "Wilson", ... }
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadEntityData(supabase: any, studentId: string, processStepData: ProcessStepData[]): Promise<Record<string, unknown>> {
  const data: Record<string, unknown> = {};

  // Load student data
  const { data: student } = await supabase
    .from("students")
    .select("*")
    .eq("id", studentId)
    .single();

  if (student) {
    for (const [k, v] of Object.entries(student)) {
      data[`student.${k}`] = v;
    }
  }

  // Load linked entities from step data
  const linkedEntityIds = new Map<string, Set<string>>();
  for (const sd of processStepData) {
    if (sd.linked_entities) {
      for (const le of sd.linked_entities) {
        if (!linkedEntityIds.has(le.type)) linkedEntityIds.set(le.type, new Set());
        linkedEntityIds.get(le.type)!.add(le.id);
      }
    }
  }

  // Fetch each entity type
  for (const [entityType, ids] of linkedEntityIds.entries()) {
    const table = ENTITY_TABLE_MAP[entityType];
    if (!table || ids.size === 0) continue;

    const { data: entities } = await supabase
      .from(table)
      .select("*")
      .in("id", Array.from(ids));

    if (entities?.[0]) {
      // Use first entity of each type for template rendering
      for (const [k, v] of Object.entries(entities[0])) {
        data[`${entityType}.${k}`] = v;
      }
    }
  }

  return data;
}

/**
 * POST /api/process-assist — AI-powered process assistant
 *
 * Actions:
 * - "status"     — Get AI summary of process progress
 * - "step_help"  — Get AI help for the current/specific step
 * - "fill_step"  — AI fills step fields from conversation
 * - "complete_step" — AI validates and completes a step with field data
 * - "render_email" — Render email template with entity data
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { action, processStateId, stepOrder, userMessage, history, fieldValues, reason } = body;

  // Actions that don't need a full process state load
  if (action === "sync_process_cards") {
    return await handleSyncProcessCards(supabase, user.id);
  }
  if (action === "pause_process" || action === "resume_process") {
    return await handleSetProcessStatus(supabase, user.id, processStateId, action === "pause_process" ? "paused" : "in_progress", reason || null);
  }

  try {
    // Load process state
    const { data: processState } = await supabase
      .from("student_process_state")
      .select("*, students(id, display_id, first_name, last_name, country_of_origin, program, intake, is_minor, english_level, education_level, preferred_city, area_of_study)")
      .eq("id", processStateId)
      .single();

    if (!processState) {
      return NextResponse.json({ error: "Process state not found" }, { status: 404 });
    }

    const state = processState as StudentProcessState & {
      students: Record<string, unknown>;
    };

    // Load process definition
    const { data: processDef } = await supabase
      .from("process_definitions")
      .select("*")
      .eq("id", state.process_definition_id)
      .single();

    if (!processDef) {
      return NextResponse.json({ error: "Process definition not found" }, { status: 404 });
    }

    const steps: StepDefinition[] = processDef.definition?.steps || [];

    // Load step data
    const { data: stepDataRows } = await supabase
      .from("process_step_data")
      .select("*")
      .eq("process_state_id", processStateId);

    const stepData: ProcessStepData[] = (stepDataRows || []).map((r: Record<string, unknown>) => ({
      ...r,
      linked_entities: r.linked_entities || [],
      emails: r.emails || [],
      field_values: r.field_values || {},
    })) as ProcessStepData[];

    // Load entity data for template rendering and AI context
    const entityData = await loadEntityData(supabase, state.student_id, stepData);

    // Resolve visible steps
    const visibleSteps = resolveVisibleSteps(
      steps,
      state.active_branches || [],
      state.skipped_steps || [],
      stepData,
      entityData,
    );

    switch (action) {
      case "status":
        return await handleStatus(supabase, state, visibleSteps, stepData, entityData);
      case "step_help":
        return await handleStepHelp(supabase, state, visibleSteps, stepData, entityData, stepOrder, userMessage, history);
      case "fill_step":
        return await handleFillStep(supabase, user.id, state, visibleSteps, stepData, entityData, stepOrder, fieldValues);
      case "complete_step":
        return await handleCompleteStep(supabase, user.id, state, visibleSteps, stepData, entityData, stepOrder, fieldValues);
      case "render_email":
        return handleRenderEmail(steps, stepOrder, entityData);
      case "sync_process_cards":
        return await handleSyncProcessCards(supabase, user.id);
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Process assist error:", error);
    const msg = error instanceof Error ? error.message : "Process assist failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * STATUS: AI summary of process progress — what's done, what's next, any blockers.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleStatus(supabase: any, state: StudentProcessState & { students: Record<string, unknown> }, visibleSteps: StepDefinition[], stepData: ProcessStepData[], entityData: Record<string, unknown>) {
  const systemPrompt = await getPrompt(supabase, "system");
  const piiCtx = await loadPiiContext(supabase);

  const completedSteps = new Set(state.completed_steps || []);
  const totalVisible = visibleSteps.length;
  const totalCompleted = visibleSteps.filter(s => completedSteps.has(s.order)).length;
  const nextStep = visibleSteps.find(s => !completedSteps.has(s.order));

  // Build step summary for AI
  const stepSummary = visibleSteps.map(s => {
    const done = completedSteps.has(s.order);
    const sd = stepData.find(d => d.step_order === s.order);
    const fieldSummary = sd?.field_values && Object.keys(sd.field_values).length > 0
      ? ` | Data: ${Object.entries(sd.field_values).map(([k, v]) => `${k}=${v}`).join(", ")}`
      : "";
    return `${done ? "✓" : "○"} Step ${s.order}: ${anonymize(s.name, piiCtx)} [${s.step_type || "check"}]${fieldSummary}`;
  }).join("\n");

  const prompt = `Give a brief, helpful status summary of this process. What's been done, what's the next step, and are there any concerns?

Process: ${state.process_name}
Student: ${entityData["student.display_id"]} ${anonymize(String(entityData["student.first_name"] || ""), piiCtx)} ${anonymize(String(entityData["student.last_name"] || ""), piiCtx)}
Progress: ${totalCompleted}/${totalVisible} steps complete
Status: ${state.status}
${state.blocked_on ? `BLOCKED: ${state.blocked_on}` : ""}

Steps:
${stepSummary}

${nextStep ? `Next step: "${anonymize(nextStep.name, piiCtx)}" (${nextStep.step_type || "check"})` : "All steps complete!"}

Keep it to 2-3 sentences. Be warm and action-oriented. End with SUGGESTIONS: for 2-3 next actions the user can take.`;

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 250,
    system: systemPrompt,
    messages: [{ role: "user", content: prompt }],
  });

  let text = message.content[0].type === "text" ? message.content[0].text : "";

  // Parse suggestions
  let suggestions: string[] = [];
  const sugMatch = text.match(/SUGGESTIONS:\s*(.+)$/m);
  if (sugMatch) {
    suggestions = sugMatch[1].split("|").map(s => s.trim()).filter(Boolean);
    text = text.replace(/SUGGESTIONS:.*$/m, "").trim();
  }

  text = deAnonymize(text, piiCtx);

  return NextResponse.json({
    message: text,
    suggestions,
    progress: { completed: totalCompleted, total: totalVisible },
    nextStep: nextStep ? { order: nextStep.order, name: nextStep.name, type: nextStep.step_type } : null,
  });
}

/**
 * STEP_HELP: AI conversation about a specific step — answer questions, suggest field values.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleStepHelp(supabase: any, state: StudentProcessState & { students: Record<string, unknown> }, visibleSteps: StepDefinition[], stepData: ProcessStepData[], entityData: Record<string, unknown>, stepOrder: number, userMessage: string, history: { role: string; content: string }[]) {
  const systemPrompt = await getPrompt(supabase, "system");
  const piiCtx = await loadPiiContext(supabase);

  const step = visibleSteps.find(s => s.order === stepOrder);
  if (!step) {
    return NextResponse.json({ error: "Step not found or not visible" }, { status: 404 });
  }

  const sd = stepData.find(d => d.step_order === stepOrder);
  const existingFieldValues = sd?.field_values || {};

  // Build field context for AI
  const fieldsContext = step.fields?.map(f => {
    const currentVal = existingFieldValues[f.key];
    const prefillVal = f.prefill_from ? entityData[f.prefill_from] : undefined;
    return `- ${f.label} (${f.type}${f.required ? ", required" : ""}): ${currentVal !== undefined ? `current="${currentVal}"` : prefillVal !== undefined ? `suggested="${prefillVal}"` : "empty"}${f.options ? ` options=[${f.options.join(", ")}]` : ""}`;
  }).join("\n") || "No fields — just a checkbox step.";

  const linkedDataContext = step.linked_data?.map(ld => {
    const vals = Object.entries(entityData)
      .filter(([k]) => k.startsWith(`${ld.entity_type}.`))
      .map(([k, v]) => `${k.split(".")[1]}=${anonymize(String(v || ""), piiCtx)}`)
      .join(", ");
    return `- ${ld.label} (${ld.entity_type}): ${vals || "not linked yet"}`;
  }).join("\n") || "";

  const prompt = `You are helping a coordinator work on a specific process step.

Process: ${state.process_name}
Student: ${entityData["student.display_id"]} ${anonymize(String(entityData["student.first_name"] || ""), piiCtx)}
Step ${step.order}: "${anonymize(step.name, piiCtx)}" [${step.step_type || "check"}]
${step.notes ? `Notes: ${step.notes}` : ""}

Fields to fill:
${fieldsContext}

${linkedDataContext ? `Linked data:\n${linkedDataContext}` : ""}

RULES:
- Be concise (1-3 sentences).
- If the user provides data for fields, acknowledge it and include FIELD_VALUES: followed by a JSON object of field key-value pairs to save.
- If the user asks you to fill/suggest values, use the available entity data to suggest appropriate values.
- If you suggest field values, include them as FIELD_VALUES: {"key": "value"} so the UI can pre-fill them.
- Always end with SUGGESTIONS: option1 | option2 | option3 for next actions.
- Include "Mark step as done" as an option when all required fields have values.`;

  const chatHistory = (history || []).map(m => ({
    role: m.role as "user" | "assistant",
    content: anonymize(m.content, piiCtx),
  }));

  const messages = [
    ...chatHistory,
    ...(userMessage ? [{ role: "user" as const, content: anonymize(userMessage, piiCtx) }] : [{ role: "user" as const, content: "I'm working on this step. What do I need to do?" }]),
  ];

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 400,
    system: systemPrompt + "\n\n" + prompt,
    messages,
  });

  let text = response.content[0].type === "text" ? response.content[0].text : "";

  // Parse field values
  let fieldValuesFromAI: Record<string, unknown> | null = null;
  const fvMatch = text.match(/FIELD_VALUES:\s*(\{[^}]+\})/);
  if (fvMatch) {
    try {
      fieldValuesFromAI = JSON.parse(fvMatch[1]);
    } catch { /* ignore parse errors */ }
    text = text.replace(/FIELD_VALUES:\s*\{[^}]+\}/, "").trim();
  }

  // Parse suggestions
  let suggestions: string[] = [];
  const sugMatch = text.match(/SUGGESTIONS:\s*(.+)$/m);
  if (sugMatch) {
    suggestions = sugMatch[1].split("|").map(s => s.trim()).filter(Boolean);
    text = text.replace(/SUGGESTIONS:.*$/m, "").trim();
  }

  text = deAnonymize(text, piiCtx);

  return NextResponse.json({
    message: text,
    suggestions,
    fieldValues: fieldValuesFromAI,
    step: { order: step.order, name: step.name, type: step.step_type, fields: step.fields },
  });
}

/**
 * Write field values back to their target tables based on step field config.
 * Handles students, homestays (create if missing), and transports (create if missing).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function performWritebacks(supabase: any, userId: string, state: StudentProcessState, step: StepDefinition, fieldValues: Record<string, unknown>) {
  if (!step.fields) return;

  const writebacks = new Map<string, Record<string, unknown>>();
  for (const field of step.fields) {
    if (field.target_table && field.target_column && fieldValues[field.key] !== undefined) {
      if (!writebacks.has(field.target_table)) writebacks.set(field.target_table, {});
      writebacks.get(field.target_table)![field.target_column] = fieldValues[field.key];
    }
  }

  for (const [table, updates] of writebacks.entries()) {
    if (table === "students") {
      await supabase.from("students").update({ ...updates, updated_by: userId }).eq("id", state.student_id);

    } else if (table === "homestays") {
      // Find the student's active or pending homestay; create one if none exists
      const { data: existing } = await supabase
        .from("homestays")
        .select("id")
        .eq("student_id", state.student_id)
        .in("status", ["pending", "active"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing) {
        await supabase.from("homestays").update({ ...updates, updated_by: userId }).eq("id", existing.id);
      } else {
        await supabase.from("homestays").insert({
          student_id: state.student_id,
          status: "pending",
          ...updates,
          created_by: userId,
          updated_by: userId,
        });
      }

    } else if (table === "transports") {
      // Infer transport type from process name if not in the updates
      const transportType = (updates.type as string) ||
        (state.process_name.includes("arrival") ? "arrival" : "departure");

      const { data: existing } = await supabase
        .from("transports")
        .select("id")
        .eq("student_id", state.student_id)
        .eq("type", transportType)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing) {
        await supabase.from("transports").update({ ...updates, updated_by: userId }).eq("id", existing.id);
      } else {
        await supabase.from("transports").insert({
          student_id: state.student_id,
          type: transportType,
          status: "pending",
          ...updates,
          created_by: userId,
          updated_by: userId,
        });
      }
    }
    // host_families / universities / drivers are shared entities — skip automatic write-back
  }
}

/**
 * FILL_STEP: Save field values for a step (without completing it).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleFillStep(supabase: any, userId: string, state: StudentProcessState, visibleSteps: StepDefinition[], stepData: ProcessStepData[], entityData: Record<string, unknown>, stepOrder: number, fieldValues: Record<string, unknown>) {
  const step = visibleSteps.find(s => s.order === stepOrder);
  if (!step) return NextResponse.json({ error: "Step not found" }, { status: 404 });

  const existingData = stepData.find(d => d.step_order === stepOrder);
  const mergedValues = { ...(existingData?.field_values || {}), ...fieldValues };

  if (existingData) {
    await supabase.from("process_step_data").update({
      field_values: mergedValues,
      updated_by: userId,
    }).eq("id", existingData.id);
  } else {
    await supabase.from("process_step_data").insert({
      process_state_id: state.id,
      step_order: stepOrder,
      field_values: mergedValues,
      created_by: userId,
      updated_by: userId,
    });
  }

  await performWritebacks(supabase, userId, state, step, fieldValues);

  void entityData;
  return NextResponse.json({ success: true, fieldValues: mergedValues });
}

/**
 * COMPLETE_STEP: Validate required fields, save data, mark step as done, sync action cards.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCompleteStep(supabase: any, userId: string, state: StudentProcessState, visibleSteps: StepDefinition[], stepData: ProcessStepData[], entityData: Record<string, unknown>, stepOrder: number, fieldValues: Record<string, unknown>) {
  const step = visibleSteps.find(s => s.order === stepOrder);
  if (!step) return NextResponse.json({ error: "Step not found" }, { status: 404 });

  const existingData = stepData.find(d => d.step_order === stepOrder);
  const mergedValues = { ...(existingData?.field_values || {}), ...(fieldValues || {}) };

  // Validate required fields
  const missingFields: string[] = [];
  if (step.fields) {
    for (const field of step.fields) {
      if (field.required && (mergedValues[field.key] === undefined || mergedValues[field.key] === null || mergedValues[field.key] === "")) {
        missingFields.push(field.label);
      }
    }
  }

  if (missingFields.length > 0) {
    return NextResponse.json({
      error: "Missing required fields",
      missingFields,
      message: `Please fill in: ${missingFields.join(", ")}`,
    }, { status: 400 });
  }

  // Save step data + mark complete
  const now = new Date().toISOString();
  if (existingData) {
    await supabase.from("process_step_data").update({
      field_values: mergedValues,
      completed_at: now,
      completed_by: userId,
      updated_by: userId,
    }).eq("id", existingData.id);
  } else {
    await supabase.from("process_step_data").insert({
      process_state_id: state.id,
      step_order: stepOrder,
      field_values: mergedValues,
      completed_at: now,
      completed_by: userId,
      created_by: userId,
      updated_by: userId,
    });
  }

  await performWritebacks(supabase, userId, state, step, mergedValues);

  // Update process state: add to completed_steps, advance current_step_order
  const completedSteps = [...new Set([...(state.completed_steps || []), stepOrder])];
  const nextStep = visibleSteps.find(s => !completedSteps.includes(s.order));

  const stateUpdate: Record<string, unknown> = {
    completed_steps: completedSteps,
    updated_by: userId,
  };

  if (nextStep) {
    stateUpdate.current_step_order = nextStep.order;
  } else {
    // All visible steps complete
    stateUpdate.status = "completed";
  }

  await supabase.from("student_process_state").update(stateUpdate).eq("id", state.id);

  // Bidirectional sync: advance the linked process card to the next step (or complete it)
  await syncProcessCard(supabase, userId, state, completedSteps, visibleSteps);

  // Handle decision branching
  if (step.step_type === "decision" && step.conditions && mergedValues.decision_value) {
    const decision = String(mergedValues.decision_value);
    const condition = step.conditions.find(c => c.if === decision);
    if (condition?.then === "activate_branch" && condition.then_branch) {
      const branches = [...new Set([...(state.active_branches || []), condition.then_branch])];
      await supabase.from("student_process_state").update({
        active_branches: branches,
        updated_by: userId,
      }).eq("id", state.id);
    }
  }

  // Suppress unused vars
  void entityData;

  return NextResponse.json({
    success: true,
    completedSteps,
    nextStep: nextStep ? { order: nextStep.order, name: nextStep.name, type: nextStep.step_type } : null,
    allComplete: !nextStep,
  });
}

/**
 * RENDER_EMAIL: Substitute template variables with entity data.
 */
function handleRenderEmail(steps: StepDefinition[], stepOrder: number, entityData: Record<string, unknown>) {
  const step = steps.find(s => s.order === stepOrder);
  if (!step?.action_config?.email_template) {
    return NextResponse.json({ error: "No email template for this step" }, { status: 400 });
  }

  const template = step.action_config.email_template;

  return NextResponse.json({
    subject: renderTemplate(template.subject_template, entityData),
    body: renderTemplate(template.body_template, entityData),
    to_field: template.to_field,
  });
}

/**
 * PAUSE / RESUME: Set process status to 'paused' or back to 'in_progress'.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSetProcessStatus(supabase: any, userId: string, processStateId: string, status: "paused" | "in_progress", reason: string | null) {
  if (!processStateId) return NextResponse.json({ error: "processStateId required" }, { status: 400 });
  const update: Record<string, unknown> = { status, updated_by: userId };
  if (status === "paused") update.blocked_on = reason;
  if (status === "in_progress") update.blocked_on = null;
  const { error } = await supabase.from("student_process_state").update(update).eq("id", processStateId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, status });
}

/**
 * SYNC_PROCESS_CARD: After a step is completed, update (or create) the linked action card
 * to point to the next uncompleted step. If all steps are done, mark the card completed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncProcessCard(supabase: any, userId: string, state: StudentProcessState & { students?: unknown }, completedSteps: number[], visibleSteps: StepDefinition[]) {
  const nextStep = visibleSteps.find(s => !completedSteps.includes(s.order));

  const { data: existingCard } = await supabase
    .from("action_cards")
    .select("id")
    .eq("linked_process_state_id", state.id)
    .eq("status", "active")
    .maybeSingle();

  if (!nextStep) {
    if (existingCard) {
      await supabase.from("action_cards").update({ status: "completed", updated_by: userId }).eq("id", existingCard.id);
    }
    return;
  }

  const processLabel = PROCESS_LABELS[state.process_name] || state.process_name;
  const student = state.students as Record<string, unknown> | null | undefined;
  const studentDisplay = student ? `${student.display_id} ${student.first_name} ${student.last_name}` : "";
  const title = `${processLabel} – ${nextStep.name}${studentDisplay ? ` · ${studentDisplay}` : ""}`;
  const context = nextStep.notes || `Step ${nextStep.order} of ${visibleSteps.length}`;

  if (existingCard) {
    await supabase.from("action_cards").update({
      title,
      context,
      linked_step_order: nextStep.order,
      updated_by: userId,
    }).eq("id", existingCard.id);
  } else {
    await supabase.from("action_cards").insert({
      category: "process",
      urgency: "medium",
      title,
      context,
      related_student_id: state.student_id,
      linked_process_state_id: state.id,
      linked_step_order: nextStep.order,
      status: "active",
      created_by: userId,
      updated_by: userId,
    });
  }
}

/**
 * HANDLE_SYNC_PROCESS_CARDS: Seed action cards for all in-progress processes that don't
 * already have an active linked card. All reads are batched in parallel.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSyncProcessCards(supabase: any, userId: string) {
  const { data: states, error } = await supabase
    .from("student_process_state")
    .select("*, students(id, display_id, first_name, last_name)")
    .eq("status", "in_progress");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!states?.length) return NextResponse.json({ synced: 0 });

  // Batch-fetch everything we need in parallel: existing linked cards, unlinked
  // process cards, all process definitions, and all step data.
  const stateIds = states.map((s: { id: string }) => s.id);
  const defIds = [...new Set(states.map((s: { process_definition_id: string }) => s.process_definition_id))] as string[];
  const studentIds = states.map((s: { student_id: string }) => s.student_id);

  const [linkedCardsRes, unlinkedCardsRes, defsRes, stepDataRes] = await Promise.all([
    supabase.from("action_cards").select("id, linked_process_state_id")
      .in("linked_process_state_id", stateIds).eq("status", "active"),
    supabase.from("action_cards").select("id, related_student_id")
      .eq("category", "process").in("related_student_id", studentIds)
      .is("linked_process_state_id", null).eq("status", "active"),
    supabase.from("process_definitions").select("id, definition").in("id", defIds),
    supabase.from("process_step_data").select("*").in("process_state_id", stateIds),
  ]);

  const linkedCardSet = new Set<string>(
    (linkedCardsRes.data || []).map((c: { linked_process_state_id: string }) => c.linked_process_state_id)
  );
  // Map student_id → first unlinked card id
  const unlinkedByStudent = new Map<string, string>();
  for (const c of (unlinkedCardsRes.data || [])) {
    if (!unlinkedByStudent.has(c.related_student_id)) {
      unlinkedByStudent.set(c.related_student_id, c.id);
    }
  }
  const defsById = new Map<string, { steps: StepDefinition[] }>();
  for (const d of (defsRes.data || [])) {
    defsById.set(d.id, d.definition);
  }
  const stepDataByState = new Map<string, ProcessStepData[]>();
  for (const r of (stepDataRes.data || [])) {
    const list = stepDataByState.get(r.process_state_id) || [];
    list.push({ ...r, linked_entities: r.linked_entities || [], emails: r.emails || [], field_values: r.field_values || {} });
    stepDataByState.set(r.process_state_id, list);
  }

  // Now process each state — no more serial DB calls
  const writes: Promise<unknown>[] = [];
  let synced = 0;

  for (const processState of states) {
    if (linkedCardSet.has(processState.id)) continue;

    const def = defsById.get(processState.process_definition_id);
    if (!def) continue;

    const steps: StepDefinition[] = def.steps || [];
    const stepData = stepDataByState.get(processState.id) || [];

    const visibleSteps = resolveVisibleSteps(
      steps,
      processState.active_branches || [],
      processState.skipped_steps || [],
      stepData,
      {},
    );

    const completedSteps: number[] = processState.completed_steps || [];
    const nextStep = visibleSteps.find(s => !completedSteps.includes(s.order));
    if (!nextStep) continue;

    const processLabel = PROCESS_LABELS[processState.process_name] || processState.process_name;
    const student = processState.students as Record<string, unknown> | null;
    const studentDisplay = student ? `${student.display_id} ${student.first_name} ${student.last_name}` : "";
    const title = `${processLabel} – ${nextStep.name}${studentDisplay ? ` · ${studentDisplay}` : ""}`;
    const context = nextStep.notes || `Step ${nextStep.order} of ${visibleSteps.length}`;

    const unlinkedCardId = unlinkedByStudent.get(processState.student_id);
    if (unlinkedCardId) {
      writes.push(supabase.from("action_cards").update({
        title, context,
        linked_process_state_id: processState.id,
        linked_step_order: nextStep.order,
        updated_by: userId,
      }).eq("id", unlinkedCardId));
    } else {
      writes.push(supabase.from("action_cards").insert({
        category: "process", urgency: "medium",
        title, context,
        related_student_id: processState.student_id,
        linked_process_state_id: processState.id,
        linked_step_order: nextStep.order,
        status: "active",
        created_by: userId, updated_by: userId,
      }));
    }
    synced++;
  }

  await Promise.all(writes);
  return NextResponse.json({ synced });
}
