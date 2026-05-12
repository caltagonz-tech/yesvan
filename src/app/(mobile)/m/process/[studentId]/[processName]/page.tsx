"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { StepDefinition, ProcessStepData, StepEmail } from "@/types/process";
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

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get process state for this student + process
    const { data: states } = await supabase
      .from("student_process_state")
      .select("*, students(display_id, first_name, last_name)")
      .eq("student_id", studentId)
      .eq("process_name", processName)
      .limit(1);

    if (!states?.length) { setLoading(false); return; }
    const ps = states[0] as ProcessState;
    setState(ps);

    // Get process definition
    const { data: def } = await supabase
      .from("process_definitions")
      .select("definition")
      .eq("id", ps.process_definition_id)
      .single();

    if (def?.definition?.steps) {
      setSteps(def.definition.steps);
    }

    // Get step data
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

  async function toggleStep(stepOrder: number) {
    if (!state) return;
    setActionLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setActionLoading(false); return; }

    const isCompleted = completedSet.has(stepOrder);
    const newCompleted = isCompleted
      ? (state.completed_steps || []).filter(s => s !== stepOrder)
      : [...(state.completed_steps || []), stepOrder];

    // Find next uncompleted step
    const nextStep = visibleSteps.find(s => !new Set(newCompleted).has(s.order));

    await supabase
      .from("student_process_state")
      .update({
        completed_steps: newCompleted,
        current_step_order: nextStep?.order ?? state.current_step_order,
        updated_by: user.id,
      })
      .eq("id", state.id);

    // Upsert step data
    if (!isCompleted) {
      const existing = stepDataMap[stepOrder];
      if (existing) {
        await supabase.from("process_step_data").update({
          completed_at: new Date().toISOString(),
          completed_by: user.id,
          updated_by: user.id,
        }).eq("id", existing.id);
      } else {
        await supabase.from("process_step_data").insert({
          process_state_id: state.id,
          step_order: stepOrder,
          completed_at: new Date().toISOString(),
          completed_by: user.id,
          created_by: user.id,
        });
      }
    } else {
      const existing = stepDataMap[stepOrder];
      if (existing) {
        await supabase.from("process_step_data").update({
          completed_at: null,
          completed_by: null,
          updated_by: user.id,
        }).eq("id", existing.id);
      }
    }

    await fetchData();
    setActionLoading(false);
  }

  async function handleDecision(stepOrder: number, value: string) {
    if (!state) return;
    setActionLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setActionLoading(false); return; }

    const step = steps.find(s => s.order === stepOrder);
    const newBranches = [...(state.active_branches || [])];

    // Check conditions for branch activation
    if (step?.conditions) {
      for (const cond of step.conditions) {
        if (cond.if === value && cond.then === "activate_branch" && cond.then_branch) {
          if (!newBranches.includes(cond.then_branch)) {
            newBranches.push(cond.then_branch);
          }
        }
      }
    }

    // Upsert step data with decision
    const existing = stepDataMap[stepOrder];
    if (existing) {
      await supabase.from("process_step_data").update({
        decision_value: value,
        completed_at: new Date().toISOString(),
        completed_by: user.id,
        updated_by: user.id,
      }).eq("id", existing.id);
    } else {
      await supabase.from("process_step_data").insert({
        process_state_id: state.id,
        step_order: stepOrder,
        decision_value: value,
        completed_at: new Date().toISOString(),
        completed_by: user.id,
        created_by: user.id,
      });
    }

    // Update state
    const newCompleted = [...(state.completed_steps || []), stepOrder];
    const nextStep = visibleSteps.find(s => !new Set(newCompleted).has(s.order));
    await supabase.from("student_process_state").update({
      completed_steps: newCompleted,
      active_branches: newBranches,
      current_step_order: nextStep?.order ?? state.current_step_order,
      updated_by: user.id,
    }).eq("id", state.id);

    await fetchData();
    setActionLoading(false);
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
          {/* Vertical timeline line */}
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

              return (
                <div key={step.order} className={`relative ${isBranch ? "ml-4" : ""}`}>
                  {/* Step indicator on timeline */}
                  <div className="flex items-start gap-3">
                    {/* Circle/icon on timeline */}
                    <button
                      onClick={() => {
                        if (stepType === "check") toggleStep(step.order);
                        else setExpandedStep(isExpanded ? null : step.order);
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
                      className={`flex-1 pb-4 ${i < visibleSteps.length - 1 ? "" : ""}`}
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

                      {/* Expanded content */}
                      {isExpanded && (
                        <div className="mt-3 space-y-3">
                          {/* Notes */}
                          {step.notes && (
                            <p className="text-xs text-white/40 bg-white/5 rounded-xl p-3">{step.notes}</p>
                          )}

                          {/* Decision buttons */}
                          {stepType === "decision" && !isCompleted && step.conditions && (
                            <div className="space-y-2">
                              <p className="text-xs text-white/50">Choose an option:</p>
                              <div className="flex flex-wrap gap-2">
                                {step.conditions.map((cond, ci) => (
                                  <button
                                    key={ci}
                                    onClick={(e) => { e.stopPropagation(); handleDecision(step.order, cond.if); }}
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

                          {/* Email step - show drafts/sent */}
                          {stepType === "email" && (
                            <div className="space-y-2">
                              {step.action_config?.email_template && (
                                <div className="bg-white/5 rounded-xl p-3 space-y-1">
                                  <div className="text-[10px] text-white/30 uppercase tracking-wider">Email template</div>
                                  <p className="text-xs text-white/60">{step.action_config.email_template.subject_template}</p>
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
                              {/* Link to card conversation for AI email assistance */}
                              {!isCompleted && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // Navigate to card conversation if linked, or create one
                                    router.push(`/m/card/new?process_state_id=${state!.id}&step_order=${step.order}&action=draft_email`);
                                  }}
                                  className="w-full py-2.5 rounded-xl bg-blue-500/15 text-blue-400 text-xs font-medium
                                    flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                                >
                                  <span className="material-symbols-outlined text-sm">smart_toy</span>
                                  Draft with AI
                                </button>
                              )}
                            </div>
                          )}

                          {/* Action step */}
                          {stepType === "action" && !isCompleted && step.action_config && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (step.action_config?.action_type === "send_email") {
                                  router.push(`/m/card/new?process_state_id=${state!.id}&step_order=${step.order}&action=draft_email`);
                                } else {
                                  toggleStep(step.order);
                                }
                              }}
                              disabled={actionLoading}
                              className="w-full py-2.5 rounded-xl bg-blue-500/20 text-blue-400 text-xs font-medium
                                active:scale-[0.98] transition-all disabled:opacity-50"
                            >
                              {step.action_config.label || "Execute action"}
                            </button>
                          )}

                          {/* Linked data summary */}
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

                          {/* Complete button for non-check steps */}
                          {stepType !== "check" && stepType !== "decision" && !isCompleted && (
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleStep(step.order); }}
                              disabled={actionLoading}
                              className="w-full py-2 rounded-xl border border-white/10 text-white/40 text-xs
                                active:scale-[0.98] transition-all disabled:opacity-50"
                            >
                              Mark as complete
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

      {/* Bottom bar - quick actions */}
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
          {state.status === "active" && completedCount === totalVisible && (
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
