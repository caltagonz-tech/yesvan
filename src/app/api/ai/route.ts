import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { buildPiiContext, anonymize, deAnonymize, type PiiContext } from "@/lib/pii";
import { DEFAULT_PROMPTS } from "@/app/api/ai-prompts/route";

const anthropic = new Anthropic();

/**
 * Load a prompt template: custom override from DB if available, else default.
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
    // Table might not exist yet — fall back to default
  }
  return DEFAULT_PROMPTS[key]?.prompt || "";
}

/** Convenience: load the system prompt (used by most handlers). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getSystemPrompt(supabase: any): Promise<string> {
  return getPrompt(supabase, "system");
}

/**
 * Load PII context from DB for anonymization/de-anonymization.
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

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { action, data } = body;

  try {
    switch (action) {
      case "greeting":
        return await handleGreeting(supabase, user.id);
      case "rank_cards":
        return await handleRankCards(supabase, data?.cards || []);
      case "prioritize_cards":
        return await handlePrioritizeCards(supabase, data?.cards || [], data?.energy || "medium");
      case "process_capture":
        return await handleProcessCapture(supabase, user.id, data?.text || "");
      case "chat":
        return await handleChat(supabase, user.id, data?.message || "", data?.context || "");
      case "intake_step":
        return await handleIntakeStep(supabase, user.id, data?.entityType || "student", data?.history || [], data?.answer || "");
      case "check_stale_data":
        return await handleCheckStaleData(supabase, user.id);
      case "card_assist":
        return await handleCardAssist(supabase, user.id, data || {});
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    console.error("AI error:", error);
    if (action === "greeting") {
      return NextResponse.json({ greeting: null, fallback: true });
    }
    const msg = error instanceof Error ? error.message : "AI processing failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGreeting(supabase: any, userId: string) {
  const systemPrompt = await getSystemPrompt(supabase);
  const greetingTemplate = await getPrompt(supabase, "greeting");

  const [profileRes, cardsRes, paymentsRes] = await Promise.all([
    supabase.from("users").select("first_name").eq("id", userId).single(),
    supabase.from("action_cards").select("title, urgency, category").eq("status", "active").eq("assigned_to", userId).order("created_at", { ascending: false }).limit(5),
    supabase.from("payments").select("amount, due_date, description").eq("status", "pending").order("due_date").limit(3),
  ]);

  const name = profileRes.data?.first_name || "there";
  const cards = cardsRes.data || [];
  const payments = paymentsRes.data || [];

  // Anonymize data before sending to AI (§9.1–9.5)
  const piiCtx = await loadPiiContext(supabase);

  const urgentCount = cards.filter((c: { urgency: string }) => c.urgency === "urgent").length;
  const totalCards = cards.length;

  // Anonymize card titles and payment descriptions
  const anonCards = cards.slice(0, 3).map((c: { title: string; urgency: string }) =>
    `"${anonymize(c.title, piiCtx)}" (${c.urgency})`
  ).join(", ") || "none";
  const anonPayments = payments.map((p: { description: string; amount: number }) =>
    `${anonymize(p.description || "", piiCtx)}: $${p.amount}`
  ).join(", ") || "none";

  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";

  const prompt = `${greetingTemplate}

User: ${name}
Time of day: ${timeOfDay}
${totalCards === 0 ? "Status: all clear, nothing pending." : `Top task: ${anonCards.split(",")[0]}`}
${urgentCount > 0 ? "There is something time-sensitive." : "Nothing urgent."}`;

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 120,
    system: systemPrompt,
    messages: [{ role: "user", content: prompt }],
  });

  let text = message.content[0].type === "text" ? message.content[0].text : "";

  // De-anonymize AI output for client display (§9.4)
  text = deAnonymize(text, piiCtx);

  return NextResponse.json({ greeting: text });
}

async function handleRankCards(supabase: unknown, cards: { id: string; title: string; urgency: string; context: string; category: string }[]) {
  if (cards.length <= 1) {
    return NextResponse.json({ ranked_ids: cards.map((c) => c.id) });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const systemPrompt = await getSystemPrompt(supabase as any);
  // Anonymize card content for AI (§9.1–9.5)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const piiCtx = await loadPiiContext(supabase as any);

  const prompt = `Rank these task cards by true priority. Consider urgency, time-sensitivity, and dependencies.

Cards:
${cards.map((c, i) => `${i + 1}. [${c.urgency}] ${anonymize(c.title, piiCtx)} — ${anonymize(c.context?.slice(0, 100) || "no context", piiCtx)}`).join("\n")}

Return ONLY a JSON array of the card numbers in priority order (highest first), like [2, 1, 3]. No explanation.`;

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    system: systemPrompt,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "[]";
  try {
    const ranking = JSON.parse(text.trim());
    const rankedIds = ranking.map((idx: number) => cards[idx - 1]?.id).filter(Boolean);
    return NextResponse.json({ ranked_ids: rankedIds });
  } catch {
    return NextResponse.json({ ranked_ids: cards.map((c) => c.id) });
  }
}

/**
 * AI-powered card prioritization based on energy level.
 * Always returns exactly 3 card IDs, selected for complexity matching:
 * - low energy → simpler, quick-win tasks (emails to send, confirmations, data entry)
 * - medium energy → balanced mix
 * - high energy → complex tasks requiring focus (decisions, research, problem-solving)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handlePrioritizeCards(supabase: any, cards: { id: string; title: string; urgency: string; context: string; category: string }[], energy: string) {
  if (cards.length <= 3) {
    return NextResponse.json({ selected_ids: cards.map((c) => c.id) });
  }

  const systemPrompt = await getSystemPrompt(supabase);
  const prioritizeTemplate = await getPrompt(supabase, "prioritize_cards");
  const piiCtx = await loadPiiContext(supabase);

  const prompt = `${prioritizeTemplate}

Current energy level: **${energy}**

Available tasks:
${cards.map((c, i) => `${i + 1}. [${c.urgency}] [${c.category}] ${anonymize(c.title, piiCtx)} — ${anonymize(c.context?.slice(0, 120) || "no context", piiCtx)}`).join("\n")}`;

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 50,
    system: systemPrompt,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "[]";
  try {
    const picks = JSON.parse(text.trim());
    const selectedIds = picks.map((idx: number) => cards[idx - 1]?.id).filter(Boolean);
    return NextResponse.json({ selected_ids: selectedIds.slice(0, 3) });
  } catch {
    // Fallback: return first 3
    return NextResponse.json({ selected_ids: cards.slice(0, 3).map((c) => c.id) });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleProcessCapture(supabase: any, userId: string, text: string) {
  if (!text.trim()) {
    return NextResponse.json({ error: "No text provided" }, { status: 400 });
  }

  const systemPrompt = await getSystemPrompt(supabase);
  const captureTemplate = await getPrompt(supabase, "process_capture");

  // Anonymize the capture text before sending to AI (§9.1–9.5)
  const piiCtx = await loadPiiContext(supabase);
  const anonText = anonymize(text, piiCtx);

  const prompt = `${captureTemplate}

Quick note: "${anonText}"`;

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    system: systemPrompt,
    messages: [{ role: "user", content: prompt }],
  });

  const responseText = message.content[0].type === "text" ? message.content[0].text : "{}";

  try {
    const parsed = JSON.parse(responseText.trim());

    const { data: cardData } = await supabase.from("action_cards").insert({
      category: parsed.category || "information",
      urgency: parsed.urgency || "low",
      title: parsed.title || text.slice(0, 60),
      context: parsed.context || text,
      status: "active",
      assigned_to: userId,
      source_user_id: userId,
      created_by: userId,
    }).select("id").single();

    if (cardData) {
      await supabase.from("quick_captures")
        .update({ needs_review: false, resolved_to_card_id: cardData.id })
        .eq("created_by", userId)
        .eq("raw_text", text)
        .eq("needs_review", true);
    }

    return NextResponse.json({ card: parsed, created: true });
  } catch {
    return NextResponse.json({ card: { title: text.slice(0, 60), context: text }, created: false });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleIntakeStep(supabase: any, userId: string, entityType: string, history: { role: string; content: string }[], answer: string) {
  const entitySchemas: Record<string, { table: string; required: string[]; optional: string[]; displayPrefix: string }> = {
    student: {
      table: "students",
      required: ["first_name", "last_name", "country_of_origin", "program", "intake"],
      optional: ["english_level", "education_level", "area_of_study", "preferred_city", "notes", "is_minor"],
      displayPrefix: "STU",
    },
    lead: {
      table: "potential_students",
      required: ["first_name", "last_name", "country", "interested_in", "contact_source"],
      optional: ["email", "phone", "age", "education_level", "english_level", "budget", "travel_date", "program_type", "notes"],
      displayPrefix: "LEAD",
    },
    host: {
      table: "homestay_families",
      required: ["family_name", "address", "phone", "email", "capacity"],
      optional: ["preferences", "pets", "dietary_notes", "distance_to_school", "notes"],
      displayPrefix: "HOST",
    },
  };

  const schema = entitySchemas[entityType];
  if (!schema) return NextResponse.json({ error: "Unknown entity type" }, { status: 400 });

  const systemPrompt = await getSystemPrompt(supabase);
  const intakeTemplate = await getPrompt(supabase, "intake_conversation");

  const messages = [
    ...history.map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
  ];
  if (answer.trim()) {
    messages.push({ role: "user" as const, content: answer });
  }

  const prompt = `${intakeTemplate}

Entity type: ${entityType}
Required fields: ${schema.required.join(", ")}
Optional fields: ${schema.optional.join(", ")}

Additional field-specific suggestions for tappable buttons:
- For yes/no questions: SUGGESTIONS: Yes | No | Not sure
- For country: SUGGESTIONS: Mexico | Colombia | Brazil | Chile | Other
- For program: SUGGESTIONS: Language | University | College | High School | Other
- For English level: SUGGESTIONS: Beginner | Intermediate | Advanced
- For education level: SUGGESTIONS: High School | Bachelor's | Master's | Other
- For contact source: SUGGESTIONS: Instagram | WhatsApp | Email | Referral | Website | Other
- For capacity (host): SUGGESTIONS: 1 | 2 | 3 | 4
- For is_minor: SUGGESTIONS: Yes (minor) | No (adult)
- For free-text fields like names, addresses, phone numbers, or notes: do NOT include SUGGESTIONS — the user should type freely

When done, respond with a JSON block wrapped in \`\`\`json\`\`\` containing all collected data with a "complete" key set to true.

Current conversation so far has ${messages.length} messages.
${messages.length === 0 ? "This is the start — greet them and ask the first question." : "Continue the conversation."}`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    system: systemPrompt + "\n\n" + prompt,
    messages: messages.length > 0 ? messages : [{ role: "user", content: `I want to add a new ${entityType}` }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  // Check if the response contains final JSON data
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    try {
      const entityData = JSON.parse(jsonMatch[1]);
      if (entityData.complete) {
        // Remove meta keys
        delete entityData.complete;
        delete entityData.next_question;

        // Save to database
        const insertData = {
          ...entityData,
          created_by: userId,
          updated_by: userId,
          status: entityType === "lead" ? "active" : undefined,
          stage: entityType === "student" ? "Initial Contact" : undefined,
        };
        // Remove undefined values
        Object.keys(insertData).forEach((k) => insertData[k] === undefined && delete insertData[k]);

        const { data: created, error } = await supabase.from(schema.table).insert(insertData).select("id, display_id").single();

        if (error) {
          return NextResponse.json({
            message: `Hmm, I had trouble saving that. Error: ${error.message}. Want to try again?`,
            done: false,
            error: true,
            suggestions: ["Try again", "Start over"],
          });
        }

        // §6 — Post-creation: auto-create process states for students
        const processResults: string[] = [];
        if (entityType === "student" && created?.id) {
          try {
            // Fetch all current process definitions
            const { data: processDefs } = await supabase
              .from("process_definitions")
              .select("id, name, definition")
              .eq("is_current", true);

            if (processDefs?.length) {
              for (const proc of processDefs) {
                const steps = proc.definition?.steps || [];
                const { data: newState } = await supabase
                  .from("student_process_state")
                  .insert({
                    student_id: created.id,
                    process_definition_id: proc.id,
                    process_name: proc.name,
                    current_step_order: steps.length > 0 ? steps[0].order : 1,
                    completed_steps: [],
                    skipped_steps: [],
                    active_branches: [],
                    status: "in_progress",
                    created_by: userId,
                    updated_by: userId,
                  })
                  .select("id")
                  .single();

                if (newState) {
                  processResults.push(proc.name);
                }
              }

              // Create initial action cards for key processes
              const processNameMap: Record<string, { title: string; context: string; urgency: string }> = {
                homestay_intake: {
                  title: `Assign host family for ${created.display_id} ${insertData.first_name} ${insertData.last_name}`,
                  context: `${insertData.first_name} ${insertData.last_name} (${created.display_id}) from ${insertData.country_of_origin || "unknown"} needs a host family. Program: ${insertData.program || "TBD"}, Intake: ${insertData.intake || "TBD"}.${insertData.is_minor ? " Minor — custodianship required." : ""}`,
                  urgency: "medium",
                },
                airport_arrival: {
                  title: `Arrange airport pickup for ${created.display_id} ${insertData.first_name} ${insertData.last_name}`,
                  context: `${insertData.first_name} ${insertData.last_name} (${created.display_id}) from ${insertData.country_of_origin || "unknown"} needs airport pickup arrangements. Program: ${insertData.program || "TBD"}, Intake: ${insertData.intake || "TBD"}.`,
                  urgency: "medium",
                },
              };

              for (const [procName, cardInfo] of Object.entries(processNameMap)) {
                if (processResults.includes(procName)) {
                  await supabase.from("action_cards").insert({
                    category: "process",
                    urgency: cardInfo.urgency,
                    title: cardInfo.title,
                    context: cardInfo.context,
                    status: "active",
                    created_by: userId,
                    updated_by: userId,
                  });
                }
              }
            }
          } catch {
            // Non-blocking — process states are a convenience, not a requirement
          }
        }

        // §6 — Post-creation follow-up: suggest next actions to maintain ADHD momentum
        const followUpActions: string[] = [];
        if (entityType === "student") {
          followUpActions.push("Send paperwork to school");
          if (processResults.includes("homestay_intake")) {
            followUpActions.push("Open accommodation checklist");
          } else {
            followUpActions.push("Set up accommodation");
          }
          if (processResults.includes("airport_arrival")) {
            followUpActions.push("Open airport pickup checklist");
          } else {
            followUpActions.push("Check airport pickup");
          }
          followUpActions.push("That's all for now");
        } else if (entityType === "lead") {
          followUpActions.push("Send intro email");
          followUpActions.push("Schedule follow-up");
          followUpActions.push("That's all for now");
        } else if (entityType === "host") {
          followUpActions.push("Check availability");
          followUpActions.push("Send welcome info");
          followUpActions.push("That's all for now");
        }

        const processMsg = processResults.length > 0
          ? ` I've also set up ${processResults.length} process checklist${processResults.length > 1 ? "s" : ""} (${processResults.join(", ")}) and created action cards for the key tasks.`
          : "";

        return NextResponse.json({
          message: `${created?.display_id || "New record"} is created!${processMsg} What should we do next?`,
          done: true,
          entityId: created?.id,
          displayId: created?.display_id,
          followUpActions,
          processesCreated: processResults,
        });
      }
    } catch {
      // JSON parse failed, treat as normal message
    }
  }

  // Extract suggestions from response
  let cleanText = text.replace(/```json[\s\S]*?```/g, "").trim();
  let suggestions: string[] = [];

  const sugMatch = cleanText.match(/SUGGESTIONS:\s*(.+)$/m);
  if (sugMatch) {
    suggestions = sugMatch[1].split("|").map((s) => s.trim()).filter(Boolean);
    cleanText = cleanText.replace(/SUGGESTIONS:\s*.+$/m, "").trim();
  }

  return NextResponse.json({
    message: cleanText,
    done: false,
    suggestions,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleChat(supabase: any, userId: string, message: string, context: string) {
  const systemPrompt = await getSystemPrompt(supabase);
  const [studentsRes, cardsRes] = await Promise.all([
    supabase.from("students").select("display_id, first_name, last_name, stage, program").eq("archived", false).limit(20),
    supabase.from("action_cards").select("title, urgency, status, category").eq("status", "active").limit(10),
  ]);

  // Anonymize data for AI (§9.1–9.5)
  const piiCtx = await loadPiiContext(supabase);

  // Only send display IDs + anonymized fields to AI — never real names
  const contextBlock = `
Current data snapshot:
- Students: ${(studentsRes.data || []).map((s: { display_id: string; stage: string; program: string }) => `${s.display_id} (${s.stage}, ${s.program || "no program"})`).join(", ")}
- Active cards: ${(cardsRes.data || []).map((c: { title: string; urgency: string }) => `${anonymize(c.title, piiCtx)} [${c.urgency}]`).join(", ")}
${context ? `\nAdditional context: ${anonymize(context, piiCtx)}` : ""}`;

  const anonMessage = anonymize(message, piiCtx);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 500,
    system: systemPrompt + "\n\n" + contextBlock,
    messages: [{ role: "user", content: anonMessage }],
  });

  let text = response.content[0].type === "text" ? response.content[0].text : "";
  // De-anonymize for client display
  text = deAnonymize(text, piiCtx);
  return NextResponse.json({ response: text });
}

/**
 * §7.2 / §12 — Data-check cards: detect stale or inconsistent data and create action cards.
 * Checks: students with missing required fields, stale records (no update in 30+ days),
 * payments without due dates, processes stuck for 14+ days.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCheckStaleData(supabase: any, userId: string) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const checks: { type: string; title: string; context: string; urgency: "medium" | "low" }[] = [];

  // 1. Students with missing critical fields
  const { data: incompleteStudents } = await supabase
    .from("students")
    .select("display_id, first_name, last_name, country_of_origin, program, intake")
    .eq("archived", false)
    .or("country_of_origin.is.null,program.is.null,intake.is.null");

  if (incompleteStudents) {
    for (const s of incompleteStudents) {
      const missing: string[] = [];
      if (!s.country_of_origin) missing.push("country");
      if (!s.program) missing.push("program");
      if (!s.intake) missing.push("intake date");
      if (missing.length > 0) {
        checks.push({
          type: "data_check",
          title: `${s.display_id} ${s.first_name || ""} — missing ${missing.join(", ")}`,
          context: `This student record is incomplete. Please add: ${missing.join(", ")}.`,
          urgency: "medium",
        });
      }
    }
  }

  // 2. Students not updated in 30+ days (may be stale)
  const { data: staleStudents } = await supabase
    .from("students")
    .select("display_id, first_name, updated_at, stage")
    .eq("archived", false)
    .lt("updated_at", thirtyDaysAgo)
    .not("stage", "eq", "Completed");

  if (staleStudents) {
    for (const s of staleStudents) {
      checks.push({
        type: "data_check",
        title: `${s.display_id} ${s.first_name || ""} hasn't been updated in a while`,
        context: `Stage: ${s.stage || "unknown"}. Last update was over 30 days ago. Is this still accurate?`,
        urgency: "low",
      });
    }
  }

  // 3. Processes stuck for 14+ days
  const { data: stuckProcesses } = await supabase
    .from("student_process_state")
    .select("id, process_name, current_step_order, updated_at, students(display_id, first_name)")
    .eq("status", "in_progress")
    .lt("updated_at", fourteenDaysAgo);

  if (stuckProcesses) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of stuckProcesses as any[]) {
      checks.push({
        type: "data_check",
        title: `${p.students?.display_id || "?"} — ${p.process_name} stuck at step ${p.current_step_order}`,
        context: `This process hasn't moved in 14+ days. Is it blocked or just paused?`,
        urgency: "medium",
      });
    }
  }

  // 4. Pending payments without due dates
  const { data: undatedPayments } = await supabase
    .from("payments")
    .select("display_id, description, amount")
    .eq("status", "pending")
    .is("due_date", null);

  if (undatedPayments) {
    for (const p of undatedPayments) {
      checks.push({
        type: "data_check",
        title: `Payment ${p.display_id || ""} has no due date`,
        context: `${p.description || "Untitled"} ($${p.amount}). Adding a due date helps track deadlines.`,
        urgency: "low",
      });
    }
  }

  // Create action cards for new issues (avoid duplicates by checking existing active data_check cards)
  const { data: existingChecks } = await supabase
    .from("action_cards")
    .select("title")
    .eq("category", "data_check")
    .eq("status", "active");

  const existingTitles = new Set((existingChecks || []).map((c: { title: string }) => c.title));
  const newChecks = checks.filter((c) => !existingTitles.has(c.title));

  if (newChecks.length > 0) {
    const inserts = newChecks.map((c) => ({
      category: "data_check",
      urgency: c.urgency,
      title: c.title,
      context: c.context,
      status: "active",
      assigned_to: userId,
      source_user_id: userId,
      created_by: userId,
    }));
    await supabase.from("action_cards").insert(inserts);
  }

  return NextResponse.json({ checked: checks.length, created: newChecks.length });
}

/**
 * Card assist: contextual AI conversation for an action card.
 * Returns a message + tappable suggestions, and optionally a draft email.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCardAssist(supabase: any, userId: string, data: any) {
  const systemBasePrompt = await getSystemPrompt(supabase);
  const cardAssistTemplate = await getPrompt(supabase, "card_assist");
  const completionTemplate = await getPrompt(supabase, "completion_flow");
  const piiCtx = await loadPiiContext(supabase);
  const { title, context, category, urgency, hasDraft, draftTo, draftSubject, userMessage, history } = data;

  const anonymizedTitle = anonymize(title || "", piiCtx);
  const anonymizedContext = anonymize(context || "", piiCtx);

  // Build conversation history
  const chatHistory = (history || []).map((m: { role: string; content: string }) => ({
    role: m.role as "user" | "assistant",
    content: anonymize(m.content, piiCtx),
  }));

  // Determine card-type-specific instructions
  let typeInstructions = "";
  let defaultSuggestions: string[] = [];

  if (category === "email") {
    if (hasDraft) {
      typeInstructions = `This is an email card with an existing AI-generated draft reply (to: ${draftTo || "unknown"}, subject: "${draftSubject || "unknown"}"). The user can review/edit/send the draft, rewrite it with a different tone, or discard it.`;
      defaultSuggestions = ["Review draft", "Rewrite — more formal", "Rewrite — shorter", "Mark as done"];
    } else {
      typeInstructions = `This is an email card. The user might want to draft a reply, forward info, or just mark it done. If asked to draft an email, return it in the draftEmail field.`;
      defaultSuggestions = ["Draft a reply", "Draft asking for an update", "Mark as done"];
    }
  } else if (category === "process") {
    typeInstructions = "This is a process/logistics card. The user might need to coordinate people, send communications, check status, or complete the task.";
    defaultSuggestions = ["Send a reminder email", "Check what's needed", "Mark as done"];
  } else if (category === "deadline") {
    typeInstructions = "This is a deadline/payment card. The user might want to send a payment reminder, check the status, or mark it handled.";
    defaultSuggestions = ["Send payment reminder", "Check payment status", "Mark as done"];
  } else if (category === "data_check") {
    typeInstructions = "This is a data quality card — something is missing or outdated. The user might want to look up the info, send a request to collect it, or mark it handled.";
    defaultSuggestions = ["Draft email to collect info", "I'll handle it manually", "Mark as done"];
  } else {
    typeInstructions = "Help the user take the next step on this task.";
    defaultSuggestions = ["Tell me more", "Mark as done"];
  }

  const systemPrompt = `${systemBasePrompt}

${cardAssistTemplate}

Card: "${anonymizedTitle}"
Context: "${anonymizedContext}"
Category: ${category} | Urgency: ${urgency}
${typeInstructions}`;

  // Completion flow: ask what data needs updating before marking done
  if (userMessage === "__COMPLETE_FLOW__") {
    try {
      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 250,
        system: `${systemBasePrompt}

${completionTemplate}

Card: "${anonymizedTitle}"
Context: "${anonymizedContext}"
Category: ${category}

Example format:
Was the code of conduct sent to the family?
SUGGESTIONS: Yes, sent and confirmed | Sent but no reply yet | Nothing to update, just mark it done`,
        messages: [{ role: "user", content: "I want to mark this task as done." }],
      });
      let text = (response.content[0] as { type: string; text: string }).text;

      // Parse suggestions
      let suggestions: string[] = [];
      const sugMatch = text.match(/SUGGESTIONS:\s*(.+)$/m);
      if (sugMatch) {
        suggestions = sugMatch[1].split("|").map((s) => s.trim()).filter(Boolean);
        text = text.replace(/SUGGESTIONS:\s*.+$/m, "").trim();
      }
      if (suggestions.length === 0) {
        suggestions = ["Nothing to update, just mark it done", "Yes, let me add details"];
      }

      text = deAnonymize(text, piiCtx);
      return NextResponse.json({ message: text, suggestions });
    } catch {
      return NextResponse.json({
        message: "Before I mark this done — any outcome or details to record?",
        suggestions: ["Nothing to update, just mark it done", "Yes, let me add details"],
      });
    }
  }

  // If no user message, return initial suggestions
  if (!userMessage) {
    const initialMsg = chatHistory.length > 0 ? undefined : await generateInitialMessage();
    return NextResponse.json({
      message: initialMsg ? deAnonymize(initialMsg, piiCtx) : `Let's work on this. What would you like to do?`,
      suggestions: defaultSuggestions,
    });
  }

  async function generateInitialMessage(): Promise<string> {
    try {
      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        system: systemPrompt,
        messages: [{ role: "user", content: "I just opened this card. Give me a brief one-sentence summary of what needs to happen, then suggest next steps." }],
      });
      const text = (response.content[0] as { type: string; text: string }).text;
      // Strip suggestions and any raw markers from the text
      return text
        .replace(/SUGGESTIONS:.*$/m, "")
        .replace(/\*\*\s*[-–]\s*/g, "")
        .replace(/DRAFT_EMAIL[\s\S]*/m, "")
        .replace(/COMPLETE_CARD/g, "")
        .trim();
    } catch {
      return `This needs your attention: **${anonymizedTitle}**. What would you like to do?`;
    }
  }

  // Process user message with AI
  const anonymizedUserMsg = anonymize(userMessage, piiCtx);

  const aiMessages = [
    ...chatHistory,
    { role: "user" as const, content: anonymizedUserMsg },
  ];

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 800,
    system: systemPrompt,
    messages: aiMessages,
  });

  let text = (response.content[0] as { type: string; text: string }).text;

  // Parse suggestions
  const sugMatch = text.match(/SUGGESTIONS:\s*(.+)$/m);
  const suggestions = sugMatch
    ? sugMatch[1].split("|").map(s => s.trim()).filter(Boolean)
    : defaultSuggestions;
  text = text.replace(/SUGGESTIONS:.*$/m, "").trim();

  // Parse draft email — flexible matching for varied AI formatting
  const draftMatch = text.match(/DRAFT_EMAIL_TO:\s*(.+?)[\r\n]+DRAFT_EMAIL_SUBJECT:\s*(.+?)[\r\n]+DRAFT_EMAIL_BODY:\s*[\r\n]+([\s\S]+?)(?:END_DRAFT|---)/);
  let draftEmail = null;
  if (draftMatch) {
    draftEmail = {
      to: deAnonymize(draftMatch[1].trim(), piiCtx),
      subject: deAnonymize(draftMatch[2].trim(), piiCtx),
      body: deAnonymize(draftMatch[3].trim(), piiCtx),
    };
    text = text.replace(/DRAFT_EMAIL_TO:[\s\S]*?(?:END_DRAFT|---[\s\S]*$)/, "").trim();

    // Save draft to the card
    await supabase.from("action_cards").update({
      draft_email_to: draftEmail.to,
      draft_email_subject: draftEmail.subject,
      draft_email_body: draftEmail.body,
      updated_by: userId,
    }).eq("id", data.cardId);
  }

  // Check for context update (outcome data from completion flow)
  const updateContextMatch = text.match(/UPDATE_CONTEXT:\s*(.+?)(?:\n|$)/);
  if (updateContextMatch && data.cardId) {
    const outcomeNote = deAnonymize(updateContextMatch[1].trim(), piiCtx);
    const timestamp = new Date().toISOString().split("T")[0];
    // Append outcome to existing card context
    const { data: currentCard } = await supabase
      .from("action_cards")
      .select("context")
      .eq("id", data.cardId)
      .single();
    const updatedContext = `${currentCard?.context || ""}\n\n[${timestamp}] Outcome: ${outcomeNote}`.trim();
    await supabase.from("action_cards").update({
      context: updatedContext,
      updated_by: userId,
    }).eq("id", data.cardId);
  }
  text = text.replace(/UPDATE_CONTEXT:\s*.+?(?:\n|$)/g, "").trim();

  // Check for completion signal
  const completeCard = text.includes("COMPLETE_CARD");
  text = text.replace(/COMPLETE_CARD/g, "").trim();

  // Clean up stray markers
  text = text.replace(/\*\*\s*[-–]\s*/g, "").replace(/---\s*$/m, "").trim();

  // De-anonymize the response
  text = deAnonymize(text, piiCtx);

  return NextResponse.json({
    message: text,
    suggestions,
    draftEmail,
    completeCard,
  });
}
