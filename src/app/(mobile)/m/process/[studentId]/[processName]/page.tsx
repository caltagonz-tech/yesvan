"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { StepDefinition, ProcessStepData, StepEmail, StepField } from "@/types/process";
import { resolveVisibleSteps } from "@/types/process";

type ProcessState = {
  id: string;
  student_id: string;
  process_definition_id: string;
  process_name: string;
  current_step_order: number;
  completed_steps: number[];
  skipped_steps: number[];
  active_branches: string[];
  status: string;
  students: { display_id: string; first_name: string; last_name: string } | null;
};

type StepDataMap = Record<number, ProcessStepData>;

export default function MobileProcessPage() {
  const { studentId, processName } = useParams<{ studentId: string; processName: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [state, setState] = useState<ProcessState | null>(null);
  const [steps, setSteps] = useState<StepDefinition[]>([]);
  const [stepDataMap, setStepDataMap] = useState<StepDataMap>({});
  const [loading, setLoading] = useState(true);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Step field form values (local edits before save)
  const [fieldEdits, setFieldEdits] = useState<Record<number, Record<string, unknown>>>({});

  // AI assist state
  const [aiMessage, setAiMessage] = useState<{ stepOrder: number; text: string; suggestions: string[] } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Rendered email cache
  const [renderedEmails, setRenderedEmails] = useState<Record<number, { subject: string; body: string }>>({});

  const currentStepRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: states } = await supabase
      .from("student_process_state")
      .select("*, students(display_id, first_name, last_name)")
      .eq("student_id", studentId)
      .eq("process_name", processName)
      .limit(1);

    if (!states?.length) { setLoading(false); return; }
    const ps = states[0] as ProcessState;
    setState(ps);

    const { data: def } = await supabase
      .from("process_definitions")
      .select("definition")
      .eq("id", ps.process_definition_id)
      .single();

    if (def?.definition?.steps) {
      setSteps(def.definition.steps);
    }

    const { data: stepData } = await supabase
      .from("process_step_data")
      .select("*")
      .eq("process_state_id", ps.id);

    if (stepData) {
      const map: StepDataMap = {};
      stepData.forEach((sd: ProcessStepData) => { map[sd.step_order] = sd; });
      setStepDataMap(map);
    }

    setLoading(false);
  }, [supabase, studentId, processName]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-expand and scroll to current step
  useEffect(() => {
    if (state && !expandedStep) {
      const completedSet = new Set(state.completed_steps || []);
      const visSteps = resolveVisibleSteps(steps, state.active_branches || [], state.skipped_steps || [], Object.values(stepDataMap));
      const next = visSteps.find(s => !completedSet.has(s.order));
      if (next) {
        setExpandedStep(next.order);
        // Scroll after render
        setTimeout(() => currentStepRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
      }
    }
  }, [state, steps, stepDataMap, expandedStep]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!state) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col items-center justify-center p-6">
        <span className="material-symbols-outlined text-4xl text-white/30 mb-3">search_off</span>
        <p className="text-white/60 text-sm">Process not found</p>
        <button onClick={() => router.back()} className="mt-4 text-sm text-blue-400">Go back</button>
      </div>
    );
  }

  const completedSet = new Set(state.completed_steps || []);
  const visibleSteps = resolveVisibleSteps(
    steps,
    state.active_branches || [],
    state.skipped_steps || [],
    Object.values(stepDataMap)
  );
  const totalVisible = visibleSteps.length;
  const completedCount = visibleSteps.filter(s => completedSet.has(s.order)).length;
  const progressPct = totalVisible > 0 ? Math.round((completedCount / totalVisible) * 100) : 0;

  const STEP_ICONS: Record<string, string> = {
    check: "task_alt",
    action: "play_circle",
    email: "mail",
    decision: "call_split",
  };

  // Get current field values for a step (saved + local edits merged)
  function getFieldValues(stepOrder: number): Record<string, unknown> {
    const saved = stepDataMap[stepOrder]?.field_values || {};
    const edits = fieldEdits[stepOrder] || {};
    return { ...saved, ...edits };
  }

  function setFieldValue(stepOrder: number, key: string, value: unknown) {
    setFieldEdits(prev => ({
      ...prev,
      [stepOrder]: { ...(prev[stepOrder] || {}), [key]: value },
    }));
  }

  // Check if all required fields are filled for a step
  function hasRequiredFields(step: StepDefinition): boolean {
    if (!step.fields?.some(f => f.required)) return true;
    const vals = getFieldValues(step.order);
    return step.fields!.filter(f => f.required).every(f => {
      const v = vals[f.key];
      return v !== undefined && v !== null && v !== "" && v !== false;
    });
  }

  // Save field values via API (with write-back)
  async function saveStepFields(stepOrder: number) {
    const edits = fieldEdits[stepOrder];
    if (!edits || Object.keys(edits).length === 0) return;

    await fetch("/api/process-assist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "fill_step",
        processStateId: state!.id,
        stepOrder,
        fieldValues: edits,
      }),
    });

    // Clear local edits for this step
    setFieldEdits(prev => {
      const next = { ...prev };
      delete next[stepOrder];
      return next;
    });
    await fetchData();
  }

  // Complete step via API (validates, saves, syncs cards)
  async function completeStep(stepOrder: number) {
    setActionLoading(true);
    const allValues = getFieldValues(stepOrder);

    const res = await fetch("/api/process-assist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "complete_step",
        processStateId: state!.id,
        stepOrder,
        fieldValues: allValues,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      // Show missing fields error
      setAiMessage({
        stepOrder,
        text: data.message || "Some required fields are missing.",
        suggestions: data.missingFields?.map((f: string) => `Fill: ${f}`) || [],
      });
      setActionLoading(false);
      return;
    }

    // Clear edits and refresh
    setFieldEdits(prev => {
      const next = { ...prev };
      delete next[stepOrder];
      return next;
    });

    // Auto-expand next step
    if (data.nextStep) {
      setExpandedStep(data.nextStep.order);
    }

    await fetchData();
    setActionLoading(false);
  }

  // Uncomplete a step (toggle back)
  async function uncompleteStep(stepOrder: number) {
    if (!state) return;
    setActionLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setActionLoading(false); return; }

    const newCompleted = (state.completed_steps || []).filter(s => s !== stepOrder);
    const nextStep = visibleSteps.find(s => !new Set(newCompleted).has(s.order));

    await supabase.from("student_process_state").update({
      completed_steps: newCompleted,
      current_step_order: nextStep?.order ?? state.current_step_order,
      status: "in_progress",
      updated_by: user.id,
    }).eq("id", state.id);

    const existing = stepDataMap[stepOrder];
    if (existing) {
      await supabase.from("process_step_data").update({
        completed_at: null,
        completed_by: null,
        updated_by: user.id,
      }).eq("id", existing.id);
    }

    setExpandedStep(stepOrder);
    await fetchData();
    setActionLoading(false);
  }

  async function handleDecision(stepOrder: number, value: string) {
    if (!state) return;
    setActionLoading(true);

    // Save decision as a field value so the API handles branching
    const allValues = { ...getFieldValues(stepOrder), decision_value: value };

    const res = await fetch("/api/process-assist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "complete_step",
        processStateId: state.id,
        stepOrder,
        fieldValues: allValues,
      }),
    });

    const data = await res.json();
    if (data.nextStep) setExpandedStep(data.nextStep.order);

    // Also save the decision_value to step_data directly
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const existing = stepDataMap[stepOrder];
      if (existing) {
        await supabase.from("process_step_data").update({
          decision_value: value,
          updated_by: user.id,
        }).eq("id", existing.id);
      }
    }

    await fetchData();
    setActionLoading(false);
  }

  // AI step help
  async function askAI(stepOrder: number, message?: string) {
    setAiLoading(true);
    try {
      const res = await fetch("/api/process-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "step_help",
          processStateId: state!.id,
          stepOrder,
          userMessage: message || "",
          history: [],
        }),
      });
      const data = await res.json();
      setAiMessage({
        stepOrder,
        text: data.message || "I can help with this step!",
        suggestions: data.suggestions || [],
      });

      // If AI suggests field values, apply them as edits
      if (data.fieldValues) {
        setFieldEdits(prev => ({
          ...prev,
          [stepOrder]: { ...(prev[stepOrder] || {}), ...data.fieldValues },
        }));
      }
    } catch {
      setAiMessage({ stepOrder, text: "Sorry, AI assist is unavailable right now.", suggestions: [] });
    }
    setAiLoading(false);
  }

  // Render email template with real data
  async function renderEmail(stepOrder: number) {
    if (renderedEmails[stepOrder]) return; // Already cached
    try {
      const res = await fetch("/api/process-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "render_email",
          processStateId: state!.id,
          stepOrder,
        }),
      });
      const data = await res.json();
      if (data.subject) {
        setRenderedEmails(prev => ({ ...prev, [stepOrder]: { subject: data.subject, body: data.body } }));
      }
    } catch { /* silently fail */ }
  }

  function getStepStatus(step: StepDefinition): "completed" | "current" | "upcoming" {
    if (completedSet.has(step.order)) return "completed";
    if (step.order === state!.current_step_order) return "current";
    return "upcoming";
  }

  function getEmails(stepOrder: number): StepEmail[] {
    const sd = stepDataMap[stepOrder];
    if (!sd?.emails) return [];
    return (Array.isArray(sd.emails) ? sd.emails : []) as StepEmail[];
  }

  const studentName = state.students
    ? `${state.students.first_name} ${state.students.last_name}`
    : state.student_id;

  const PROCESS_LABELS: Record<string, string> = {
    academic_placement: "Academic Placement",
    homestay_intake: "Homestay Intake",
    custodianship: "Custodianship",
    airport_arrival: "Airport Arrival",
    airport_departure: "Airport Departure",
  };

  // ── Field Renderer ──
  function renderField(field: StepField, stepOrder: number, disabled: boolean) {
    const values = getFieldValues(stepOrder);
    const val = values[field.key];

    const baseClass = "w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-blue-500/40 focus:border-blue-500/30";

    switch (field.type) {
      case "boolean":
        return (
          <label className="flex items-center gap-3 py-1 cursor-pointer">
            <div
              onClick={() => !disabled && setFieldValue(stepOrder, field.key, !val)}
              className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                val ? "bg-blue-500 border-blue-500" : "border-white/20 bg-white/5"
              } ${disabled ? "opacity-50" : ""}`}
            >
              {val ? <span className="material-symbols-outlined text-[14px] text-white">check</span> : null}
            </div>
            <span className={`text-sm ${val ? "text-white" : "text-white/60"}`}>{field.label}</span>
            {field.required && <span className="text-red-400 text-xs">*</span>}
          </label>
        );

      case "select":
        return (
          <div>
            <label className="text-xs text-white/40 block mb-1">
              {field.label}{field.required && <span className="text-red-400 ml-0.5">*</span>}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {(field.options || []).map(opt => (
                <button
                  key={opt}
                  onClick={() => !disabled && setFieldValue(stepOrder, field.key, opt)}
                  disabled={disabled}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    val === opt
                      ? "bg-blue-500/25 text-blue-300 border border-blue-500/30"
                      : "bg-white/5 text-white/50 border border-white/10 hover:bg-white/10"
                  } ${disabled ? "opacity-50" : ""}`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        );

      case "textarea":
        return (
          <div>
            <label className="text-xs text-white/40 block mb-1">
              {field.label}{field.required && <span className="text-red-400 ml-0.5">*</span>}
            </label>
            <textarea
              value={String(val || "")}
              onChange={e => setFieldValue(stepOrder, field.key, e.target.value)}
              placeholder={field.placeholder || ""}
              disabled={disabled}
              rows={3}
              className={`${baseClass} resize-y ${disabled ? "opacity-50" : ""}`}
            />
          </div>
        );

      case "number":
        return (
          <div>
            <label className="text-xs text-white/40 block mb-1">
              {field.label}{field.required && <span className="text-red-400 ml-0.5">*</span>}
            </label>
            <input
              type="number"
              value={val !== undefined && val !== null ? String(val) : ""}
              onChange={e => setFieldValue(stepOrder, field.key, e.target.value ? Number(e.target.value) : "")}
              placeholder={field.placeholder || ""}
              disabled={disabled}
              className={`${baseClass} ${disabled ? "opacity-50" : ""}`}
            />
          </div>
        );

      case "date":
        return (
          <div>
            <label className="text-xs text-white/40 block mb-1">
              {field.label}{field.required && <span className="text-red-400 ml-0.5">*</span>}
            </label>
            <input
              type="date"
              value={String(val || "")}
              onChange={e => setFieldValue(stepOrder, field.key, e.target.value)}
              disabled={disabled}
              className={`${baseClass} ${disabled ? "opacity-50" : ""}`}
            />
          </div>
        );

      case "entity_picker":
        // For now, render as text input. Can be upgraded to search-select later.
        return (
          <div>
            <label className="text-xs text-white/40 block mb-1">
              {field.label}{field.required && <span className="text-red-400 ml-0.5">*</span>}
              <span className="text-white/20 ml-1">({field.entity_type})</span>
            </label>
            <input
              type="text"
              value={String(val || "")}
              onChange={e => setFieldValue(stepOrder, field.key, e.target.value)}
              placeholder={field.placeholder || `Search ${field.entity_type}...`}
              disabled={disabled}
              className={`${baseClass} ${disabled ? "opacity-50" : ""}`}
            />
          </div>
        );

      default: // text, email, phone
        return (
          <div>
            <label className="text-xs text-white/40 block mb-1">
              {field.label}{field.required && <span className="text-red-400 ml-0.5">*</span>}
            </label>
            <input
              type={field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text"}
              value={String(val || "")}
              onChange={e => setFieldValue(stepOrder, field.key, e.target.value)}
              placeholder={field.placeholder || ""}
              disabled={disabled}
              className={`${baseClass} ${disabled ? "opacity-50" : ""}`}
            />
          </div>
        );
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white pb-24">
      {/* Header */}
      <div className="sticky top-0 z-20 backdrop-blur-xl bg-[#0a0a0f]/80 border-b border-white/5">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => router.back()} className="p-1">
            <span className="material-symbols-outlined text-xl text-white/60">arrow_back</span>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold truncate">
              {PROCESS_LABELS[processName] || processName.replace(/_/g, " ")}
            </h1>
            <p className="text-xs text-white/40 truncate">
              {state.students?.display_id} · {studentName}
            </p>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-white/90">{progressPct}%</div>
            <div className="text-[10px] text-white/30">{completedCount}/{totalVisible}</div>
          </div>
        </div>
        {/* Progress bar */}
        <div className="h-0.5 bg-white/5">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Steps timeline */}
      <div className="px-4 py-4">
        <div className="relative">
          <div className="absolute left-5 top-0 bottom-0 w-px bg-white/10" />

          <div className="space-y-1">
            {visibleSteps.map((step, i) => {
              const status = getStepStatus(step);
              const isCurrent = status === "current";
              const isCompleted = status === "completed";
              const isExpanded = expandedStep === step.order;
              const stepType = step.step_type || "check";
              const emails = getEmails(step.order);
              const isBranch = !!step.branch;
              const sd = stepDataMap[step.order];
              const hasFields = step.fields && step.fields.length > 0;
              const hasEdits = fieldEdits[step.order] && Object.keys(fieldEdits[step.order]).length > 0;
              const canComplete = hasRequiredFields(step);
              const rendered = renderedEmails[step.order];

              return (
                <div
                  key={step.order}
                  ref={isCurrent ? currentStepRef : undefined}
                  className={`relative ${isBranch ? "ml-4" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    {/* Timeline indicator */}
                    <button
                      onClick={() => {
                        if (isCompleted) {
                          setExpandedStep(isExpanded ? null : step.order);
                        } else if (stepType === "check" && !hasFields && canComplete) {
                          completeStep(step.order);
                        } else {
                          setExpandedStep(isExpanded ? null : step.order);
                        }
                      }}
                      disabled={actionLoading}
                      className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                        isCompleted
                          ? "bg-green-500/20 text-green-400"
                          : isCurrent
                          ? "bg-blue-500/20 text-blue-400 ring-2 ring-blue-500/30"
                          : "bg-white/5 text-white/30"
                      }`}
                    >
                      {isCompleted ? (
                        <span className="material-symbols-outlined text-lg">check_circle</span>
                      ) : (
                        <span className="material-symbols-outlined text-lg">
                          {STEP_ICONS[stepType] || "radio_button_unchecked"}
                        </span>
                      )}
                    </button>

                    {/* Step content */}
                    <div
                      className="flex-1 pb-4"
                      onClick={() => setExpandedStep(isExpanded ? null : step.order)}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-medium ${
                            isCompleted ? "text-white/40 line-through" : isCurrent ? "text-white" : "text-white/60"
                          }`}
                        >
                          {step.name}
                        </span>
                        {isCurrent && (
                          <span className="px-1.5 py-0.5 rounded-md bg-blue-500/20 text-blue-400 text-[10px] font-semibold uppercase">
                            Next
                          </span>
                        )}
                        {isBranch && (
                          <span className="px-1.5 py-0.5 rounded-md bg-purple-500/20 text-purple-400 text-[10px]">
                            {step.branch}
                          </span>
                        )}
                      </div>

                      {/* Meta line */}
                      <div className="flex items-center gap-2 mt-0.5">
                        {step.typically_responsible && (
                          <span className="text-[10px] text-white/25">{step.typically_responsible}</span>
                        )}
                        {step.expected_duration_days && (
                          <span className="text-[10px] text-white/25">{step.expected_duration_days}d</span>
                        )}
                        {hasFields && (
                          <span className={`text-[10px] ${canComplete ? "text-green-400/60" : "text-yellow-400/60"}`}>
                            {canComplete ? "fields ready" : "fields needed"}
                          </span>
                        )}
                        {emails.length > 0 && (
                          <span className="text-[10px] text-green-400/60">
                            {emails.filter(e => e.sent_at).length} sent
                          </span>
                        )}
                        {sd?.decision_value && (
                          <span className="text-[10px] text-purple-400/60">
                            {sd.decision_value}
                          </span>
                        )}
                      </div>

                      {/* ── Expanded content ── */}
                      {isExpanded && (
                        <div className="mt-3 space-y-3" onClick={e => e.stopPropagation()}>
                          {/* Notes */}
                          {step.notes && (
                            <p className="text-xs text-white/40 bg-white/5 rounded-xl p-3">{step.notes}</p>
                          )}

                          {/* ── Step Fields Form ── */}
                          {hasFields && (
                            <div className="space-y-3 bg-white/[0.03] rounded-2xl p-3">
                              {step.fields!.map(field => (
                                <div key={field.key}>
                                  {renderField(field, step.order, isCompleted)}
                                </div>
                              ))}

                              {/* Save fields button (when edits exist) */}
                              {hasEdits && !isCompleted && (
                                <button
                                  onClick={() => saveStepFields(step.order)}
                                  disabled={actionLoading}
                                  className="w-full py-2 rounded-xl bg-white/10 text-white/60 text-xs font-medium
                                    active:scale-[0.98] transition-all disabled:opacity-50"
                                >
                                  Save progress
                                </button>
                              )}
                            </div>
                          )}

                          {/* Decision buttons */}
                          {stepType === "decision" && !isCompleted && step.conditions && (
                            <div className="space-y-2">
                              <p className="text-xs text-white/50">Choose an option:</p>
                              <div className="flex flex-wrap gap-2">
                                {step.conditions.map((cond, ci) => (
                                  <button
                                    key={ci}
                                    onClick={() => handleDecision(step.order, cond.if)}
                                    disabled={actionLoading}
                                    className="px-3 py-2 rounded-xl bg-purple-500/15 text-purple-300 text-xs font-medium
                                      hover:bg-purple-500/25 active:scale-95 transition-all disabled:opacity-50"
                                  >
                                    {cond.if}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Decision result */}
                          {stepType === "decision" && sd?.decision_value && (
                            <div className="flex items-center gap-2 bg-purple-500/10 rounded-xl p-3">
                              <span className="material-symbols-outlined text-sm text-purple-400">check</span>
                              <span className="text-xs text-purple-300">Decision: {sd.decision_value}</span>
                            </div>
                          )}

                          {/* Email step */}
                          {stepType === "email" && (
                            <div className="space-y-2">
                              {step.action_config?.email_template && (
                                <div className="bg-white/5 rounded-xl p-3 space-y-1">
                                  <div className="text-[10px] text-white/30 uppercase tracking-wider">Email preview</div>
                                  <p className="text-xs text-white/60 font-medium">
                                    {rendered?.subject || step.action_config.email_template.subject_template}
                                  </p>
                                  <p className="text-xs text-white/40 whitespace-pre-line line-clamp-4">
                                    {rendered?.body || step.action_config.email_template.body_template}
                                  </p>
                                  {!rendered && (
                                    <button
                                      onClick={() => renderEmail(step.order)}
                                      className="text-[10px] text-blue-400 mt-1"
                                    >
                                      Load with real data
                                    </button>
                                  )}
                                </div>
                              )}
                              {emails.map((email, ei) => (
                                <div key={ei} className={`rounded-xl p-3 ${email.sent_at ? "bg-green-500/10" : "bg-yellow-500/10"}`}>
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className={`material-symbols-outlined text-sm ${email.sent_at ? "text-green-400" : "text-yellow-400"}`}>
                                      {email.sent_at ? "check_circle" : "edit"}
                                    </span>
                                    <span className="text-xs font-medium text-white/70">
                                      {email.sent_at ? "Sent" : "Draft"}
                                    </span>
                                    <span className="text-[10px] text-white/30">to {email.draft_to}</span>
                                  </div>
                                  <p className="text-xs text-white/50 truncate">{email.draft_subject}</p>
                                </div>
                              ))}
                              {!isCompleted && (
                                <button
                                  onClick={() => router.push(`/m/card/new?process_state_id=${state!.id}&step_order=${step.order}&action=draft_email`)}
                                  className="w-full py-2.5 rounded-xl bg-blue-500/15 text-blue-400 text-xs font-medium
                                    flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                                >
                                  <span className="material-symbols-outlined text-sm">smart_toy</span>
                                  Draft with AI
                                </button>
                              )}
                            </div>
                          )}

                          {/* Action step button */}
                          {stepType === "action" && !isCompleted && step.action_config && !hasFields && (
                            <button
                              onClick={() => {
                                if (step.action_config?.action_type === "send_email") {
                                  router.push(`/m/card/new?process_state_id=${state!.id}&step_order=${step.order}&action=draft_email`);
                                } else {
                                  completeStep(step.order);
                                }
                              }}
                              disabled={actionLoading}
                              className="w-full py-2.5 rounded-xl bg-blue-500/20 text-blue-400 text-xs font-medium
                                active:scale-[0.98] transition-all disabled:opacity-50"
                            >
                              {step.action_config.label || "Execute action"}
                            </button>
                          )}

                          {/* Linked data */}
                          {step.linked_data && step.linked_data.length > 0 && (
                            <div className="space-y-1">
                              {step.linked_data.map((ld, li) => (
                                <div key={li} className="flex items-center gap-2 bg-white/5 rounded-xl p-2.5">
                                  <span className="material-symbols-outlined text-sm text-white/30">link</span>
                                  <span className="text-xs text-white/50">{ld.label}</span>
                                  <span className="text-[10px] text-white/25">({ld.entity_type})</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* AI Assist message */}
                          {aiMessage?.stepOrder === step.order && (
                            <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-3 space-y-2">
                              <div className="flex items-start gap-2">
                                <span className="material-symbols-outlined text-sm text-blue-400 mt-0.5">smart_toy</span>
                                <p className="text-xs text-white/70 flex-1">{aiMessage.text}</p>
                              </div>
                              {aiMessage.suggestions.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 pl-6">
                                  {aiMessage.suggestions.map((s, si) => (
                                    <button
                                      key={si}
                                      onClick={() => askAI(step.order, s)}
                                      className="px-2.5 py-1 rounded-lg bg-blue-500/15 text-blue-300 text-[11px] font-medium
                                        active:scale-95 transition-all"
                                    >
                                      {s}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Action buttons row */}
                          {!isCompleted && (
                            <div className="flex gap-2">
                              {/* AI Help */}
                              <button
                                onClick={() => askAI(step.order)}
                                disabled={aiLoading}
                                className="flex-1 py-2.5 rounded-xl bg-white/5 text-white/50 text-xs font-medium
                                  flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all disabled:opacity-50"
                              >
                                <span className="material-symbols-outlined text-sm">smart_toy</span>
                                {aiLoading && aiMessage?.stepOrder === step.order ? "Thinking..." : "AI Help"}
                              </button>

                              {/* Complete step */}
                              <button
                                onClick={() => completeStep(step.order)}
                                disabled={actionLoading || !canComplete}
                                className={`flex-1 py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5
                                  active:scale-[0.98] transition-all disabled:opacity-30 ${
                                    canComplete
                                      ? "bg-green-500/20 text-green-400"
                                      : "bg-white/5 text-white/30"
                                  }`}
                              >
                                <span className="material-symbols-outlined text-sm">check_circle</span>
                                Done
                              </button>
                            </div>
                          )}

                          {/* Undo for completed steps */}
                          {isCompleted && (
                            <button
                              onClick={() => uncompleteStep(step.order)}
                              disabled={actionLoading}
                              className="w-full py-2 rounded-xl border border-white/5 text-white/25 text-xs
                                active:scale-[0.98] transition-all disabled:opacity-50"
                            >
                              Undo completion
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 backdrop-blur-xl bg-[#0a0a0f]/80 border-t border-white/5 px-4 py-3 safe-bottom">
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="px-4 py-2 rounded-xl bg-white/5 text-white/60 text-xs font-medium"
          >
            <span className="material-symbols-outlined text-sm align-middle mr-1">arrow_back</span>
            Back
          </button>
          <div className="text-xs text-white/30">
            {completedCount} of {totalVisible} complete
          </div>
          {completedCount === totalVisible && totalVisible > 0 && (
            <button
              className="px-4 py-2 rounded-xl bg-green-500/20 text-green-400 text-xs font-semibold"
            >
              <span className="material-symbols-outlined text-sm align-middle mr-1">check_circle</span>
              Finish
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
