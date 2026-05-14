import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { ImapFlow } from "imapflow";
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
        return await handleGreeting(supabase, user.id, data?.cards || []);
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
async function handleGreeting(supabase: any, userId: string, clientCards: { title: string; urgency: string; category: string }[] = []) {
  const systemPrompt = await getSystemPrompt(supabase);
  const greetingTemplate = await getPrompt(supabase, "greeting");

  const profileRes = await supabase.from("users").select("first_name").eq("id", userId).single();
  const name = profileRes.data?.first_name || "there";
  const piiCtx = await loadPiiContext(supabase);

  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";

  const hasCards = clientCards.length > 0;
  const hasUrgent = clientCards.some(c => c.urgency === "urgent");

  const cardLines = clientCards.map(c =>
    `- "${anonymize(c.title, piiCtx)}" (${c.urgency}, ${c.category})`
  ).join("\n") || "none";

  const prompt = `${greetingTemplate}

User: ${name}
Time of day: ${timeOfDay}
${hasCards ? `Cards on their plate right now:\n${cardLines}` : "Status: nothing pending — all clear."}

Write 1-2 sentences max. Introduce what's waiting for them by briefly naming the actual tasks (not generic summaries). Be warm and grounding — like a calm, focused assistant who helps someone with ADHD start their day without overwhelm. No bullet lists, no counting tasks, no numbers. End with a nudge toward the first action. Use real task names from the list above.${hasUrgent ? " One task is time-sensitive — acknowledge it without adding pressure." : ""}`;

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 160,
    system: systemPrompt,
    messages: [{ role: "user", content: prompt }],
  });

  let text = message.content[0].type === "text" ? message.content[0].text : "";
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
 * Checks: students, drivers, universities, leads, and hosts for missing fields and stale records;
 * payments without due dates; processes stuck for 14+ days; unsent draft email cards.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCheckStaleData(supabase: any, userId: string) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  const checks: { type: string; title: string; context: string; urgency: "medium" | "low" }[] = [];

  // Run all independent DB reads in parallel
  const [
    incompleteStudentsRes,
    staleStudentsRes,
    stuckProcessesRes,
    undatedPaymentsRes,
    incompleteDriversRes,
    staleDriversRes,
    incompleteUnisRes,
    staleUnisRes,
    incompleteLeadsRes,
    staleLeadsRes,
    incompleteHostsRes,
    staleHostsRes,
    staleDraftEmailsRes,
  ] = await Promise.all([
    // 1. Students with missing critical fields
    supabase
      .from("students")
      .select("display_id, first_name, last_name, country_of_origin, program, intake")
      .eq("archived", false)
      .or("country_of_origin.is.null,program.is.null,intake.is.null"),

    // 2. Students not updated in 30+ days
    supabase
      .from("students")
      .select("display_id, first_name, updated_at, stage")
      .eq("archived", false)
      .lt("updated_at", thirtyDaysAgo)
      .not("stage", "eq", "Completed"),

    // 3. Processes stuck for 14+ days
    supabase
      .from("student_process_state")
      .select("id, process_name, current_step_order, updated_at, students(display_id, first_name)")
      .eq("status", "in_progress")
      .lt("updated_at", fourteenDaysAgo),

    // 4. Pending payments without due dates
    supabase
      .from("payments")
      .select("display_id, description, amount")
      .eq("status", "pending")
      .is("due_date", null),

    // 5. Drivers with missing contact or vehicle info
    supabase
      .from("drivers")
      .select("display_id, first_name, last_name, phone, email, vehicle_info")
      .eq("archived", false)
      .or("phone.is.null,email.is.null,vehicle_info.is.null"),

    // 6. Drivers not updated in 6+ months
    supabase
      .from("drivers")
      .select("display_id, first_name, updated_at")
      .eq("archived", false)
      .lt("updated_at", sixMonthsAgo),

    // 7. Universities with missing contact info
    supabase
      .from("universities")
      .select("display_id, name, contact_email, contact_phone")
      .eq("archived", false)
      .or("contact_email.is.null,contact_phone.is.null"),

    // 8. Universities not updated in 6+ months
    supabase
      .from("universities")
      .select("display_id, name, updated_at")
      .eq("archived", false)
      .lt("updated_at", sixMonthsAgo),

    // 9. Leads with missing contact info
    supabase
      .from("potential_students")
      .select("display_id, first_name, last_name, email, phone")
      .eq("archived", false)
      .or("email.is.null,phone.is.null"),

    // 10. Leads not followed up in 14+ days (exclude converted/lost)
    supabase
      .from("potential_students")
      .select("display_id, first_name, last_name, updated_at, pipeline_stage, status")
      .eq("archived", false)
      .lt("updated_at", fourteenDaysAgo)
      .not("status", "eq", "converted")
      .not("status", "eq", "lost"),

    // 11. Hosts with missing contact info
    supabase
      .from("host_families")
      .select("display_id, family_name, email, phone")
      .eq("archived", false)
      .or("email.is.null,phone.is.null"),

    // 12. Hosts not updated in 6+ months
    supabase
      .from("host_families")
      .select("display_id, family_name, updated_at")
      .eq("archived", false)
      .lt("updated_at", sixMonthsAgo),

    // 13. Email draft cards sitting unsent for 3+ days
    supabase
      .from("action_cards")
      .select("id, title, draft_email_to, created_at")
      .eq("category", "email")
      .eq("status", "active")
      .not("draft_email_body", "is", null)
      .lt("created_at", threeDaysAgo),
  ]);

  // 1. Students — missing fields
  for (const s of incompleteStudentsRes.data || []) {
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

  // 2. Students — stale
  for (const s of staleStudentsRes.data || []) {
    checks.push({
      type: "data_check",
      title: `${s.display_id} ${s.first_name || ""} hasn't been updated in a while`,
      context: `Stage: ${s.stage || "unknown"}. Last update was over 30 days ago. Is this still accurate?`,
      urgency: "low",
    });
  }

  // 3. Processes — stuck
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of (stuckProcessesRes.data || []) as any[]) {
    checks.push({
      type: "data_check",
      title: `${p.students?.display_id || "?"} — ${p.process_name} stuck at step ${p.current_step_order}`,
      context: `This process hasn't moved in 14+ days. Is it blocked or just paused?`,
      urgency: "medium",
    });
  }

  // 4. Payments — no due date
  for (const p of undatedPaymentsRes.data || []) {
    checks.push({
      type: "data_check",
      title: `Payment ${p.display_id || ""} has no due date`,
      context: `${p.description || "Untitled"} ($${p.amount}). Adding a due date helps track deadlines.`,
      urgency: "low",
    });
  }

  // 5. Drivers — missing fields
  for (const d of incompleteDriversRes.data || []) {
    const missing: string[] = [];
    if (!d.phone) missing.push("phone");
    if (!d.email) missing.push("email");
    if (!d.vehicle_info) missing.push("vehicle info");
    if (missing.length > 0) {
      checks.push({
        type: "data_check",
        title: `${d.display_id} ${d.first_name || ""} ${d.last_name || ""} — missing ${missing.join(", ")}`,
        context: `This driver record is incomplete. Please add: ${missing.join(", ")}.`,
        urgency: "medium",
      });
    }
  }

  // 6. Drivers — stale
  for (const d of staleDriversRes.data || []) {
    checks.push({
      type: "data_check",
      title: `${d.display_id} ${d.first_name || ""} driver record hasn't been updated in a while`,
      context: `Last update was over 6 months ago. Are their availability and contact details still current?`,
      urgency: "low",
    });
  }

  // 7. Universities — missing contact info
  for (const u of incompleteUnisRes.data || []) {
    const missing: string[] = [];
    if (!u.contact_email) missing.push("contact email");
    if (!u.contact_phone) missing.push("contact phone");
    if (missing.length > 0) {
      checks.push({
        type: "data_check",
        title: `${u.display_id} ${u.name || ""} — missing ${missing.join(", ")}`,
        context: `This university record is incomplete. Please add: ${missing.join(", ")}.`,
        urgency: "low",
      });
    }
  }

  // 8. Universities — stale
  for (const u of staleUnisRes.data || []) {
    checks.push({
      type: "data_check",
      title: `${u.display_id} ${u.name || ""} university record hasn't been updated in a while`,
      context: `Last update was over 6 months ago. Are the contact details and programs still accurate?`,
      urgency: "low",
    });
  }

  // 9. Leads — missing contact info
  for (const l of incompleteLeadsRes.data || []) {
    const missing: string[] = [];
    if (!l.email) missing.push("email");
    if (!l.phone) missing.push("phone");
    if (missing.length > 0) {
      checks.push({
        type: "data_check",
        title: `${l.display_id} ${l.first_name || ""} ${l.last_name || ""} — missing contact ${missing.join(" and ")}`,
        context: `This lead has no ${missing.join(" or ")}. Without contact info, follow-up isn't possible.`,
        urgency: "medium",
      });
    }
  }

  // 10. Leads — stale (no follow-up in 14+ days)
  for (const l of staleLeadsRes.data || []) {
    checks.push({
      type: "data_check",
      title: `${l.display_id} ${l.first_name || ""} ${l.last_name || ""} — lead not followed up in 14+ days`,
      context: `Stage: ${l.pipeline_stage || "unknown"}. Last update over 14 days ago — leads cool off fast, worth a quick check-in.`,
      urgency: "medium",
    });
  }

  // 11. Hosts — missing contact info
  for (const h of incompleteHostsRes.data || []) {
    const missing: string[] = [];
    if (!h.email) missing.push("email");
    if (!h.phone) missing.push("phone");
    if (missing.length > 0) {
      checks.push({
        type: "data_check",
        title: `${h.display_id} ${h.family_name || ""} — missing ${missing.join(", ")}`,
        context: `This host family record is incomplete. Please add: ${missing.join(", ")}.`,
        urgency: "medium",
      });
    }
  }

  // 12. Hosts — stale
  for (const h of staleHostsRes.data || []) {
    checks.push({
      type: "data_check",
      title: `${h.display_id} ${h.family_name || ""} host record hasn't been updated in a while`,
      context: `Last update was over 6 months ago. Are their availability and preferences still current?`,
      urgency: "low",
    });
  }

  // 13. Email drafts — sitting unsent for 3+ days
  for (const card of staleDraftEmailsRes.data || []) {
    const subject = card.title.replace(/^Reply:\s*/i, "");
    checks.push({
      type: "data_check",
      title: `Unsent draft reply: "${subject}"`,
      context: `A draft reply${card.draft_email_to ? ` to ${card.draft_email_to}` : ""} has been sitting unsent for 3+ days. Review and send, or dismiss if no longer needed.`,
      urgency: "medium",
    });
  }

  // 14. Unanswered incoming emails — connect to IMAP and find emails with no \Answered flag older than 48h
  const unansweredEmailCards: { title: string; context: string; urgency: "urgent" | "medium" }[] = [];
  try {
    const { data: emailProfile } = await supabase
      .from("users")
      .select("roundcube_host, roundcube_username, roundcube_password_encrypted")
      .eq("id", userId)
      .single();

    if (emailProfile?.roundcube_host && emailProfile?.roundcube_username && emailProfile?.roundcube_password_encrypted) {
      const client = new ImapFlow({
        host: emailProfile.roundcube_host,
        port: 993,
        secure: true,
        auth: { user: emailProfile.roundcube_username, pass: emailProfile.roundcube_password_encrypted },
        logger: false,
      });

      await client.connect();
      const lock = await client.getMailboxLock("INBOX");
      try {
        const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
        // Find emails older than 48h that have not been answered
        const searchResult = await client.search({ answered: false, before: twoDaysAgo }, { uid: true });
        const unansweredUids: number[] = Array.isArray(searchResult) ? searchResult : [];
        // Check at most the 10 most recent to avoid flooding
        const uidsToCheck = unansweredUids.slice(-10);
        if (uidsToCheck.length > 0) for await (const msg of client.fetch(uidsToCheck, { envelope: true, flags: true }, { uid: true })) {
          if (!msg.envelope) continue;
          const subject = msg.envelope.subject || "(no subject)";
          const from = msg.envelope.from?.[0];
          const fromStr = from?.name || from?.address || "Unknown";
          const date = msg.envelope.date;
          const daysOld = date ? Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)) : 2;

          unansweredEmailCards.push({
            title: `Reply needed: ${subject.slice(0, 55)}`,
            context: `From ${fromStr}, ${daysOld} day${daysOld !== 1 ? "s" : ""} ago. This email hasn't been replied to yet.`,
            urgency: daysOld >= 5 ? "urgent" : "medium",
          });
        }
      } finally {
        lock.release();
        await client.logout();
      }
    }
  } catch {
    // IMAP not configured or unreachable — skip silently
  }

  if (unansweredEmailCards.length > 0) {
    const { data: existingEmailCards } = await supabase
      .from("action_cards")
      .select("title")
      .eq("category", "email")
      .eq("status", "active");

    const existingEmailTitles = new Set((existingEmailCards || []).map((c: { title: string }) => c.title));
    const newEmailCards = unansweredEmailCards.filter((c) => !existingEmailTitles.has(c.title));

    if (newEmailCards.length > 0) {
      await supabase.from("action_cards").insert(
        newEmailCards.map((c) => ({
          category: "email",
          urgency: c.urgency,
          title: c.title,
          context: c.context,
          status: "active",
          assigned_to: userId,
          source_user_id: userId,
          created_by: userId,
        }))
      );
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
  const { title, context, category, urgency, hasDraft, draftTo, draftSubject, userMessage, history, linkedProcessStateId, linkedStepOrder } = data;

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
    // If linked to a checklist step, load step details for richer context
    if (linkedProcessStateId && linkedStepOrder != null) {
      try {
        const { data: ps } = await supabase
          .from("student_process_state")
          .select("process_name, process_definition_id")
          .eq("id", linkedProcessStateId)
          .single();
        const { data: pd } = ps ? await supabase
          .from("process_definitions")
          .select("definition")
          .eq("id", ps.process_definition_id)
          .single() : { data: null };
        const steps = pd?.definition?.steps || [];
        const step = steps.find((s: { order: number }) => s.order === linkedStepOrder);
        if (step) {
          const fieldsList = step.fields?.map((f: { label: string; type: string; required?: boolean }) => `${f.label} (${f.type}${f.required ? ", required" : ""})`).join(", ") || "no fields";
          typeInstructions = `This card tracks a checklist step in the ${ps?.process_name} process.\nCurrent step: "${step.name}" (step ${step.order}).\n${step.notes ? `Notes: ${step.notes}\n` : ""}Fields to fill: ${fieldsList}.\nWhen the user says this step is done or confirms all required info: output ADVANCE_PROCESS:${step.order} on its own line, AND output STEP_FIELDS: followed by a JSON object with all boolean fields set to true and any values the user confirmed. Example: STEP_FIELDS: {"julieta_letter_received": true, "parents_letter_received": true}\nIf the user asks to pause or put the process on hold, output PAUSE_PROCESS: followed by the reason on its own line. If they ask to resume or unpause, output RESUME_PROCESS on its own line.`;
          defaultSuggestions = ["This step is done", "What do I need for this step?", "Mark card as done"];
        }
      } catch { /* fall through to generic */ }
    }
    if (!typeInstructions) {
      typeInstructions = "This is a process/logistics card. The user might need to coordinate people, send communications, check status, or complete the task.";
      defaultSuggestions = ["Send a reminder email", "Check what's needed", "Mark as done"];
    }
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
${typeInstructions}

AVAILABLE DATA IN THIS SYSTEM (only reference these — never invent other databases, queues, or lists):
- Students: name, country, program, start date, university, status
- Host families: name, city, capacity, languages spoken, preferences, availability dates
- Drivers: name, vehicle, availability
- Universities: name, programs, contact
- Action cards: task title, context, category, urgency, status
- Process checklists: per-student progress through defined steps (academic placement, homestay intake, custodianship, airport arrival/departure)
- Payments: amounts, due dates, status
Do NOT suggest checking anything outside this list (e.g. no "pending applications queue", no "intake queue", no external systems).`;

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
    const initial = chatHistory.length > 0 ? undefined : await generateInitialMessage();
    return NextResponse.json({
      message: initial ? deAnonymize(initial.message, piiCtx) : `Let's work on this. What would you like to do?`,
      suggestions: initial?.suggestions?.length ? initial.suggestions : defaultSuggestions,
    });
  }

  async function fetchRelevantData(): Promise<string> {
    // Include userMessage so follow-up queries like "check which hosts are in the system" trigger data fetches
    const combined = `${title || ""} ${context || ""} ${userMessage || ""}`.toLowerCase();
    const snippets: string[] = [];

    // Host family matching
    if (combined.includes("host family") || combined.includes("homestay") || combined.includes("host fam") || combined.includes("host")) {
      const { data: allHosts } = await supabase
        .from("host_families")
        .select("display_id, family_name, city, capacity, languages_spoken, preferences, email, host_availability(available_from, available_to)")
        .eq("status", "active")
        .eq("archived", false);

      const hosts = allHosts || [];

      if (hosts.length === 0) {
        snippets.push("Host families: no active host families exist in the system yet.");
      } else {
        // Try to extract a target month/year from context (e.g. "March 2027")
        const dateMatch = (context || "").match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/i);

        if (dateMatch) {
          const targetDate = new Date(`${dateMatch[1]} 1, ${dateMatch[2]}`);
          const targetStr = targetDate.toISOString().slice(0, 10);
          const available = hosts.filter((h: any) => {
            if (!h.host_availability?.length) return true;
            return h.host_availability.some((a: any) => a.available_from <= targetStr && a.available_to >= targetStr);
          });
          const unavailable = hosts.filter((h: any) => !available.includes(h));

          if (available.length > 0) {
            const list = available.map((h: any) => formatHost(h)).join("\n");
            snippets.push(`Host families confirmed available for ${dateMatch[1]} ${dateMatch[2]} (${available.length}):\n${list}`);
          } else {
            snippets.push(`No host families have confirmed availability for ${dateMatch[1]} ${dateMatch[2]}.`);
          }
          if (unavailable.length > 0) {
            const list = unavailable.map((h: any) => formatHost(h)).join("\n");
            snippets.push(`All other active host families in the system (${unavailable.length}) — could be contacted about flexibility:\n${list}`);
          }
        } else {
          const list = hosts.map((h: any) => formatHost(h)).join("\n");
          snippets.push(`All active host families in the system (${hosts.length}):\n${list}`);
        }
      }
    }

    function formatHost(h: any): string {
      const langs = h.languages_spoken?.length ? ` | Languages: ${h.languages_spoken.join(", ")}` : "";
      const prefs = h.preferences ? ` | Notes: ${h.preferences}` : "";
      const email = h.email ? ` | Email: ${h.email}` : "";
      return `- ${h.display_id} — ${h.family_name} (${h.city || "city unknown"}, capacity: ${h.capacity}${langs}${prefs}${email})`;
    }

    // Student record + homestay assignment + process progress
    // Triggered for any card that involves a student (process keywords OR student-related actions)
    const studentCardKeywords = ["intake", "progress", "checklist", "process", "step", "placement", "custodianship", "arrival", "departure", "airport", "pickup", "family", "host", "student", "schedule"];
    if (studentCardKeywords.some(k => combined.includes(k))) {
      // Try STU-XXX ID first, fall back to name extraction from title/context
      const stuMatch = `${title || ""} ${context || ""}`.match(/STU-\d+/i);
      let studentRow: any = null;

      if (stuMatch) {
        const { data } = await supabase
          .from("students")
          .select("id, display_id, first_name, last_name, stage, next_step, program, intake, email")
          .eq("display_id", stuMatch[0].toUpperCase())
          .single();
        studentRow = data;
      } else {
        // Try to match a student name from the PII context against the card title/context
        const cardText = `${title || ""} ${context || ""}`.toLowerCase();
        const matched = piiCtx.students.find(s => s.name && cardText.includes(s.name.toLowerCase()));
        if (matched) {
          const { data } = await supabase
            .from("students")
            .select("id, display_id, first_name, last_name, stage, next_step, program, intake, email")
            .eq("display_id", matched.displayId)
            .single();
          studentRow = data;
        }
      }

      if (studentRow) {
        const sid = studentRow.display_id;

        // Homestay assignment
        const { data: homestay } = await supabase
          .from("homestays")
          .select("status, arrival_date, host_families(display_id, family_name, city)")
          .eq("student_id", studentRow.id)
          .in("status", ["pending", "active"])
          .maybeSingle();

        const hostInfo = homestay
          ? `Host family assigned: ${(homestay.host_families as any)?.display_id} — ${(homestay.host_families as any)?.family_name} (${(homestay.host_families as any)?.city}), arrival ${homestay.arrival_date}, status: ${homestay.status}`
          : `No host family assigned yet for ${sid}.`;

        // Process states
        const { data: processStates } = await supabase
          .from("student_process_state")
          .select("process_name, current_step_order, completed_steps, status, blocked_on")
          .eq("student_id", studentRow.id);

        let processInfo = "";
        if (processStates && processStates.length > 0) {
          processInfo = processStates.map((ps: any) => {
            const done = ps.completed_steps?.length ?? 0;
            const blocked = ps.blocked_on ? ` | Blocked: ${ps.blocked_on}` : "";
            return `  - ${ps.process_name}: step ${ps.current_step_order}, ${done} steps done, status: ${ps.status}${blocked}`;
          }).join("\n");
        } else {
          processInfo = "  No process records found.";
        }

        // Payments for this student
        const { data: payments } = await supabase
          .from("payments")
          .select("display_id, direction, counterparty_type, amount, currency, due_date, paid_date, status, category, description, notes")
          .eq("linked_student_id", studentRow.id)
          .order("due_date", { ascending: true });

        let paymentsInfo = "";
        if (payments && payments.length > 0) {
          paymentsInfo = "\nPayments:\n" + payments.map((p: any) => {
            const due = p.due_date ? ` | due ${p.due_date}` : "";
            const paid = p.paid_date ? ` | paid ${p.paid_date}` : "";
            const notes = p.notes ? ` | notes: ${p.notes}` : "";
            const desc = p.description ? ` (${p.description})` : "";
            return `  - ${p.display_id} ${p.direction} ${p.category || "payment"}${desc}: $${p.amount} ${p.currency} — ${p.status}${due}${paid}${notes}`;
          }).join("\n");
        } else {
          paymentsInfo = "\nPayments: none on record for this student.";
        }

        const studentEmail = studentRow.email ? ` | Email: ${studentRow.email}` : "";
        snippets.push(`Student ${sid} (${studentRow.first_name} ${studentRow.last_name}${studentEmail}) — stage: ${studentRow.stage || "unknown"}, program: ${studentRow.program || "unknown"}\n${hostInfo}\nProcess progress:\n${processInfo}${paymentsInfo}`);
      }
    }

    // Driver availability
    const driverKeywords = ["driver", "pickup", "drop-off", "dropoff", "transport", "airport pickup", "drive", "vehicle", "availability"];
    if (driverKeywords.some(k => combined.includes(k))) {
      const { data: allDrivers } = await supabase
        .from("drivers")
        .select("display_id, first_name, last_name, phone, email, vehicle_info, vehicle_capacity, region, notes, status, driver_availability(available_date, available, notes)")
        .eq("status", "active")
        .eq("archived", false);

      if (!allDrivers?.length) {
        snippets.push("Drivers: no active drivers in the system.");
      } else {
        // Try to extract a target date from card title/context/userMessage
        const dateMatch = `${title || ""} ${context || ""} ${userMessage || ""}`.match(/\b(\d{4}-\d{2}-\d{2}|\w+ \d{1,2},?\s+\d{4}|\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\b/);

        const list = allDrivers.map((d: any) => {
          const phone = d.phone ? ` | ${d.phone}` : "";
          const email = d.email ? ` | ${d.email}` : "";
          const vehicle = d.vehicle_info ? ` | ${d.vehicle_info}` : "";
          const capacity = d.vehicle_capacity ? ` (capacity: ${d.vehicle_capacity})` : "";
          const region = d.region ? ` | region: ${d.region}` : "";
          const notes = d.notes ? ` | notes: ${d.notes}` : "";

          let avail = "";
          if (d.driver_availability?.length) {
            const upcoming = (d.driver_availability as any[])
              .filter(a => a.available_date >= new Date().toISOString().slice(0, 10))
              .sort((a: any, b: any) => a.available_date.localeCompare(b.available_date))
              .slice(0, 5);
            if (upcoming.length) {
              avail = " | Available: " + upcoming.map((a: any) => `${a.available_date}${a.available ? "" : " (unavailable)"}${a.notes ? ` (${a.notes})` : ""}`).join(", ");
            } else {
              avail = " | No upcoming availability set";
            }
          } else {
            avail = " | No availability records";
          }
          return `  - ${d.display_id} ${d.first_name} ${d.last_name}${phone}${email}${vehicle}${capacity}${region}${notes}${avail}`;
        }).join("\n");

        const hint = dateMatch ? ` (date mentioned: ${dateMatch[0]})` : "";
        snippets.push(`Drivers${hint}:\n${list}`);
      }
    }

    // Standalone payment lookup (when the card isn't about a specific student but mentions payments)
    const paymentKeywords = ["payment", "invoice", "fee", "paid", "overdue", "amount", "receipt"];
    if (!snippets.some(s => s.includes("Payments:")) && paymentKeywords.some(k => combined.includes(k))) {
      const { data: recentPayments } = await supabase
        .from("payments")
        .select("display_id, direction, counterparty_type, amount, currency, due_date, paid_date, status, category, description")
        .order("created_at", { ascending: false })
        .limit(20);

      if (recentPayments && recentPayments.length > 0) {
        const list = recentPayments.map((p: any) => {
          const due = p.due_date ? ` | due ${p.due_date}` : "";
          const paid = p.paid_date ? ` | paid ${p.paid_date}` : "";
          const desc = p.description ? ` (${p.description})` : "";
          return `  - ${p.display_id} ${p.direction} ${p.category || "payment"}${desc}: $${p.amount} ${p.currency} — ${p.status}${due}${paid}`;
        }).join("\n");
        snippets.push(`Recent payments (last 20):\n${list}`);
      } else {
        snippets.push("Payments: no payment records found in the system.");
      }
    }

    return snippets.join("\n\n");
  }

  async function generateInitialMessage(): Promise<{ message: string; suggestions: string[] }> {
    try {
      const relevantData = await fetchRelevantData();
      const enrichedSystem = relevantData
        ? `${systemPrompt}\n\nRELEVANT DATA FROM THE DATABASE:\n${relevantData}\n\nIMPORTANT: You have real data above. Write a short message (2-3 sentences max) that states the situation and what the user needs to decide — but do NOT list the options or choices inside the message text. The options will appear as buttons below. Put all actionable choices only in the SUGGESTIONS line.`
        : systemPrompt;

      const userPrompt = relevantData
        ? "I just opened this card. Briefly state the situation in 1-2 sentences (no option lists, no numbered steps). Then on a new line write: SUGGESTIONS: with 2-4 short button labels that are the concrete next actions, separated by |"
        : "I just opened this card. Briefly state what needs to happen in 1-2 sentences. Then on a new line write: SUGGESTIONS: with 2-4 short, specific action labels separated by |";

      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        system: enrichedSystem,
        messages: [{ role: "user", content: userPrompt }],
      });
      let text = (response.content[0] as { type: string; text: string }).text;

      const sugMatch = text.match(/SUGGESTIONS:\s*(.+)$/m);
      const suggestions = sugMatch
        ? sugMatch[1].split("|").map((s: string) => s.trim()).filter(Boolean)
        : [];

      text = text
        .replace(/SUGGESTIONS:.*$/m, "")
        .replace(/\*\*\s*[-–]\s*/g, "")
        .replace(/DRAFT_EMAIL[\s\S]*/m, "")
        .replace(/COMPLETE_CARD/g, "")
        .trim();

      return { message: text, suggestions };
    } catch {
      return { message: `This needs your attention: **${anonymizedTitle}**. What would you like to do?`, suggestions: [] };
    }
  }

  // Process user message with AI
  const anonymizedUserMsg = anonymize(userMessage, piiCtx);

  const aiMessages = [
    ...chatHistory,
    { role: "user" as const, content: anonymizedUserMsg },
  ];

  // Enrich system prompt with relevant data for follow-ups too
  const followUpData = await fetchRelevantData();
  const followUpSystem = followUpData
    ? `${systemPrompt}\n\nRELEVANT DATA FROM THE DATABASE:\n${followUpData}`
    : systemPrompt;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 800,
    system: followUpSystem,
    messages: aiMessages,
  });

  let text = (response.content[0] as { type: string; text: string }).text;

  // Parse suggestions — handle both "SUGGESTIONS:" label and raw pipe-separated lines
  const sugMatch = text.match(/SUGGESTIONS:\s*(.+)$/m);
  // Also catch lines that are purely pipe-separated options (AI sometimes skips the label)
  const pipeLineMatch = !sugMatch && text.match(/\n([^.\n]+\|[^.\n]+)$/m);
  const suggestions = sugMatch
    ? sugMatch[1].split("|").map(s => s.trim()).filter(Boolean)
    : pipeLineMatch
      ? pipeLineMatch[1].split("|").map(s => s.trim()).filter(Boolean)
      : defaultSuggestions;
  // Strip both forms from the message body, plus any stray ** markers
  text = text
    .replace(/SUGGESTIONS:.*$/m, "")
    .replace(/\n[^.\n]+\|[^.\n]+$/m, "")
    .replace(/\*\*\s*\|[\s\S]*$/, "")
    .trim();

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

    // If the AI put a name instead of an email, try to resolve it
    if (draftEmail.to && !draftEmail.to.includes("@")) {
      const namePart = draftEmail.to.split(" ")[0].toLowerCase();
      const { data: hostMatch } = await supabase
        .from("host_families")
        .select("email")
        .ilike("family_name", `%${namePart}%`)
        .not("email", "is", null)
        .limit(1)
        .maybeSingle();
      if (hostMatch?.email) {
        draftEmail.to = hostMatch.email;
      } else {
        const { data: studentMatch } = await supabase
          .from("students")
          .select("email")
          .or(`first_name.ilike.%${namePart}%,last_name.ilike.%${namePart}%`)
          .not("email", "is", null)
          .limit(1)
          .maybeSingle();
        if (studentMatch?.email) {
          draftEmail.to = studentMatch.email;
        }
      }
    }

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

  // Parse record update commands
  const UPDATABLE_FIELDS: Record<string, string[]> = {
    host_families: ["email", "phone", "address", "city", "preferences", "notes", "family_rate"],
    students: ["email", "phone", "stage", "next_step", "notes", "preferred_city"],
    drivers: ["email", "phone", "notes"],
  };
  const updateMatches = [...text.matchAll(/UPDATE_RECORD:\s*(\{[^}]+\})/g)];
  let recordUpdates: { label: string; success: boolean }[] = [];

  for (const match of updateMatches) {
    try {
      const raw = JSON.parse(match[1]) as { entity: string; field: string; value: string };
      const { entity, field, value } = raw;

      // Determine table from display ID prefix
      let table = "";
      let idColumn = "display_id";
      if (/^HOST-/i.test(entity)) table = "host_families";
      else if (/^STU-/i.test(entity)) table = "students";
      else if (/^DRV-/i.test(entity)) table = "drivers";

      const allowed = table ? UPDATABLE_FIELDS[table] : [];
      if (table && allowed.includes(field)) {
        await supabase.from(table).update({ [field]: value, updated_by: userId }).eq(idColumn, entity.toUpperCase());
        recordUpdates.push({ label: `Updated ${entity} ${field}`, success: true });
      } else {
        recordUpdates.push({ label: `Cannot update ${field} on ${entity}`, success: false });
      }
    } catch {
      // malformed JSON — skip
    }
  }
  text = text.replace(/UPDATE_RECORD:\s*\{[^}]+\}/g, "").trim();

  // Check for completion signal
  const completeCard = text.includes("COMPLETE_CARD");
  text = text.replace(/COMPLETE_CARD/g, "").trim();

  // Parse process step advancement signal + field values
  let advanceProcess: number | null = null;
  const advanceMatch = text.match(/ADVANCE_PROCESS:(\d+)/);
  if (advanceMatch) {
    advanceProcess = parseInt(advanceMatch[1], 10);
    text = text.replace(/ADVANCE_PROCESS:\d+/g, "").trim();
  }

  let stepFieldValues: Record<string, unknown> | null = null;
  const stepFieldsMatch = text.match(/STEP_FIELDS:\s*(\{[\s\S]*?\})/);
  if (stepFieldsMatch) {
    try { stepFieldValues = JSON.parse(stepFieldsMatch[1]); } catch { /* ignore */ }
    text = text.replace(/STEP_FIELDS:\s*\{[\s\S]*?\}/, "").trim();
  }

  let pauseProcess: string | null = null;
  let resumeProcess = false;
  const pauseMatch = text.match(/PAUSE_PROCESS:\s*(.+?)(?:\n|$)/);
  if (pauseMatch) {
    pauseProcess = pauseMatch[1].trim();
    text = text.replace(/PAUSE_PROCESS:\s*.+?(?:\n|$)/, "").trim();
  }
  if (text.includes("RESUME_PROCESS")) {
    resumeProcess = true;
    text = text.replace(/RESUME_PROCESS/g, "").trim();
  }

  // Clean up stray markers
  text = text.replace(/\*\*\s*[-–]\s*/g, "").replace(/---\s*$/m, "").trim();

  // De-anonymize the response
  text = deAnonymize(text, piiCtx);

  return NextResponse.json({
    message: text,
    suggestions,
    draftEmail,
    completeCard,
    advanceProcess,
    stepFieldValues,
    pauseProcess,
    resumeProcess,
    recordUpdates,
  });
}
