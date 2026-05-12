"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { StepDefinition, ProcessStepData, LinkedEntity, StepEmail } from "@/types/process";
import { resolveVisibleSteps } from "@/types/process";

type ProcessDefinition = {
  id: string;
  name: string;
  version: number;
  definition: { steps: StepDefinition[] };
};

type ProcessState = {
  id: string;
  student_id: string;
  process_definition_id: string;
  process_name: string;
  current_step_order: number;
  completed_steps: number[];
  skipped_steps: number[];
  active_branches: string[];
  blocked_on: string | null;
  assigned_to: string | null;
  status: string;
  students: { display_id: string; first_name: string; last_name: string } | null;
};

type UserMap = Record<string, string>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EntityData = Record<string, any>;

const PROCESS_LABELS: Record<string, string> = {
  academic_placement: "Academic Placement",
  homestay_intake: "Homestay Intake",
  custodianship: "Custodianship",
  airport_arrival: "Airport Arrival",
  airport_departure: "Airport Departure",
};

const STEP_TYPE_ICONS: Record<string, string> = {
  check: "check_box_outline_blank",
  action: "play_circle",
  email: "mail",
  decision: "call_split",
};

const ENTITY_TABLE_MAP: Record<string, string> = {
  student: "students",
  host: "homestay_families",
  driver: "drivers",
  university: "universities",
  transport: "transports",
  payment: "payments",
  homestay: "homestays",
};

export default function ChecklistsPage() {
  const [states, setStates] = useState<ProcessState[]>([]);
  const [definitions, setDefinitions] = useState<ProcessDefinition[]>([]);
  const [users, setUsers] = useState<UserMap>({});
  const [stepData, setStepData] = useState<Record<string, ProcessStepData[]>>({});
  const [loading, setLoading] = useState(true);
  const [expandedProcess, setExpandedProcess] = useState<string | null>(null);
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "in_progress" | "paused" | "completed">("in_progress");
  const [saving, setSaving] = useState<string | null>(null);

  // Email composer state
  const [composingEmail, setComposingEmail] = useState<{ stateId: string; stepOrder: number } | null>(null);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  // Linked entity expansion
  const [expandedEntities, setExpandedEntities] = useState<Record<string, EntityData[]>>({});

  const supabase = createClient();

  const fetchData = useCallback(async () => {
    const [statesRes, defsRes, usersRes] = await Promise.all([
      supabase
        .from("student_process_state")
        .select("*, students(display_id, first_name, last_name)")
        .order("created_at", { ascending: false }),
      supabase
        .from("process_definitions")
        .select("*")
        .eq("is_current", true),
      supabase
        .from("users")
        .select("id, first_name, last_name"),
    ]);

    if (defsRes.data) setDefinitions(defsRes.data);
    if (statesRes.data) {
      setStates(statesRes.data);
      // Fetch step data for all states
      const stateIds = statesRes.data.map((s: ProcessState) => s.id);
      if (stateIds.length > 0) {
        const { data: allStepData } = await supabase
          .from("process_step_data")
          .select("*")
          .in("process_state_id", stateIds);
        if (allStepData) {
          const grouped: Record<string, ProcessStepData[]> = {};
          allStepData.forEach((sd: ProcessStepData) => {
            if (!grouped[sd.process_state_id]) grouped[sd.process_state_id] = [];
            grouped[sd.process_state_id].push(sd);
          });
          setStepData(grouped);
        }
      }
    }
    if (usersRes.data) {
      const map: UserMap = {};
      usersRes.data.forEach((u: { id: string; first_name: string; last_name: string }) => {
        map[u.id] = `${u.first_name} ${u.last_name}`.trim();
      });
      setUsers(map);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const channel = supabase
      .channel("checklists-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "student_process_state" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "process_step_data" }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, fetchData]);

  const filteredStates = states.filter((s) => filter === "all" || s.status === filter);

  const grouped = filteredStates.reduce<Record<string, ProcessState[]>>((acc, state) => {
    const key = state.process_name;
    if (!acc[key]) acc[key] = [];
    acc[key].push(state);
    return acc;
  }, {});

  function getDefinition(processName: string): ProcessDefinition | undefined {
    return definitions.find((d) => d.name === processName);
  }

  function getSteps(processName: string): StepDefinition[] {
    const def = getDefinition(processName);
    return def?.definition.steps || [];
  }

  function getVisibleSteps(state: ProcessState): StepDefinition[] {
    const allSteps = getSteps(state.process_name);
    const sd = stepData[state.id] || [];
    return resolveVisibleSteps(allSteps, state.active_branches || [], state.skipped_steps || [], sd);
  }

  function getNextBlockingStep(state: ProcessState): StepDefinition | null {
    const steps = getVisibleSteps(state);
    const completed = new Set(state.completed_steps || []);
    return steps.find((s) => !completed.has(s.order)) || null;
  }

  function getStepDataForStep(stateId: string, stepOrder: number): ProcessStepData | undefined {
    return (stepData[stateId] || []).find(sd => sd.step_order === stepOrder);
  }

  async function toggleStep(stateId: string, stepOrder: number, currentCompleted: number[]) {
    setSaving(stateId);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(null); return; }

    const completed = new Set(currentCompleted);
    if (completed.has(stepOrder)) {
      completed.delete(stepOrder);
    } else {
      completed.add(stepOrder);
    }

    const completedArr = Array.from(completed).sort((a, b) => a - b);
    const state = states.find((s) => s.id === stateId);
    const steps = state ? getVisibleSteps(state) : [];
    const allDone = steps.length > 0 && steps.every((s) => completed.has(s.order));
    const nextStep = steps.find((s) => !completed.has(s.order));

    await supabase
      .from("student_process_state")
      .update({
        completed_steps: completedArr,
        current_step_order: nextStep?.order || completedArr[completedArr.length - 1] || 1,
        status: allDone ? "completed" : "in_progress",
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", stateId);

    // Also update process_step_data
    const existingSD = getStepDataForStep(stateId, stepOrder);
    if (completed.has(stepOrder) && !existingSD) {
      await supabase.from("process_step_data").insert({
        process_state_id: stateId,
        step_order: stepOrder,
        completed_at: new Date().toISOString(),
        completed_by: user.id,
        created_by: user.id,
      });
    } else if (completed.has(stepOrder) && existingSD) {
      await supabase.from("process_step_data").update({
        completed_at: new Date().toISOString(),
        completed_by: user.id,
        updated_by: user.id,
      }).eq("id", existingSD.id);
    } else if (!completed.has(stepOrder) && existingSD) {
      await supabase.from("process_step_data").update({
        completed_at: null,
        completed_by: null,
        updated_by: user.id,
      }).eq("id", existingSD.id);
    }

    setSaving(null);
    fetchData();
  }

  async function handleDecision(stateId: string, stepOrder: number, value: string, activateBranch?: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Save decision in step data
    const existingSD = getStepDataForStep(stateId, stepOrder);
    if (existingSD) {
      await supabase.from("process_step_data").update({
        decision_value: value,
        updated_by: user.id,
      }).eq("id", existingSD.id);
    } else {
      await supabase.from("process_step_data").insert({
        process_state_id: stateId,
        step_order: stepOrder,
        decision_value: value,
        completed_at: new Date().toISOString(),
        completed_by: user.id,
        created_by: user.id,
      });
    }

    // Activate branch if needed + mark step complete
    const state = states.find(s => s.id === stateId);
    const newBranches = [...(state?.active_branches || [])];
    if (activateBranch && !newBranches.includes(activateBranch)) {
      newBranches.push(activateBranch);
    }

    const newCompleted = new Set(state?.completed_steps || []);
    newCompleted.add(stepOrder);
    const completedArr = Array.from(newCompleted).sort((a, b) => a - b);

    await supabase.from("student_process_state").update({
      active_branches: newBranches,
      completed_steps: completedArr,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    }).eq("id", stateId);

    fetchData();
  }

  async function openEmailComposer(stateId: string, stepOrder: number, step: StepDefinition) {
    const template = step.action_config?.email_template;
    setComposingEmail({ stateId, stepOrder });
    setEmailTo(template?.to_field === "manual" ? "" : (template?.to_field || ""));
    setEmailSubject(template?.subject_template || "");
    setEmailBody(template?.body_template || "");
  }

  async function handleSendStepEmail() {
    if (!composingEmail) return;
    setSendingEmail(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSendingEmail(false); return; }

    try {
      // Send via email API
      const res = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", data: { to: emailTo, subject: emailSubject, body: emailBody } }),
      });
      const result = await res.json();

      // Store email in step data
      const newEmail: StepEmail = {
        draft_to: emailTo,
        draft_subject: emailSubject,
        draft_body: emailBody,
        sent_at: result.success ? new Date().toISOString() : null,
        sent_by: result.success ? user.id : null,
      };

      const existingSD = getStepDataForStep(composingEmail.stateId, composingEmail.stepOrder);
      if (existingSD) {
        const emails = [...(existingSD.emails || []), newEmail];
        await supabase.from("process_step_data").update({
          emails,
          completed_at: result.success ? new Date().toISOString() : null,
          completed_by: result.success ? user.id : null,
          updated_by: user.id,
        }).eq("id", existingSD.id);
      } else {
        await supabase.from("process_step_data").insert({
          process_state_id: composingEmail.stateId,
          step_order: composingEmail.stepOrder,
          emails: [newEmail],
          completed_at: result.success ? new Date().toISOString() : null,
          completed_by: result.success ? user.id : null,
          created_by: user.id,
        });
      }

      if (result.success) {
        // Mark step complete
        const state = states.find(s => s.id === composingEmail.stateId);
        const newCompleted = new Set(state?.completed_steps || []);
        newCompleted.add(composingEmail.stepOrder);
        await supabase.from("student_process_state").update({
          completed_steps: Array.from(newCompleted).sort((a, b) => a - b),
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        }).eq("id", composingEmail.stateId);

        setComposingEmail(null);
        fetchData();
      }
    } catch { /* ignore */ }
    setSendingEmail(false);
  }

  async function saveDraftEmail() {
    if (!composingEmail) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const draft: StepEmail = {
      draft_to: emailTo,
      draft_subject: emailSubject,
      draft_body: emailBody,
      sent_at: null,
      sent_by: null,
    };

    const existingSD = getStepDataForStep(composingEmail.stateId, composingEmail.stepOrder);
    if (existingSD) {
      const emails = [...(existingSD.emails || []).filter(e => e.sent_at), draft];
      await supabase.from("process_step_data").update({ emails, updated_by: user.id }).eq("id", existingSD.id);
    } else {
      await supabase.from("process_step_data").insert({
        process_state_id: composingEmail.stateId,
        step_order: composingEmail.stepOrder,
        emails: [draft],
        created_by: user.id,
      });
    }
    setComposingEmail(null);
    fetchData();
  }

  async function fetchLinkedEntities(stateId: string, stepOrder: number, step: StepDefinition) {
    const key = `${stateId}_${stepOrder}`;
    if (expandedEntities[key]) {
      setExpandedEntities(prev => { const n = { ...prev }; delete n[key]; return n; });
      return;
    }

    if (!step.linked_data?.length) return;

    const entities: EntityData[] = [];
    for (const ld of step.linked_data) {
      const table = ENTITY_TABLE_MAP[ld.entity_type];
      if (!table) continue;

      const fields = ld.fields_to_show?.length ? ld.fields_to_show.join(", ") : "*";
      const { data } = await supabase.from(table).select(fields).limit(5);
      if (data) {
        entities.push({
          label: ld.label,
          entity_type: ld.entity_type,
          rows: data.slice(0, 3),
          fields: ld.fields_to_show || Object.keys(data[0] || {}),
        });
      }
    }
    setExpandedEntities(prev => ({ ...prev, [key]: entities }));
  }

  async function updateBlockedOn(stateId: string, value: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("student_process_state")
      .update({ blocked_on: value || null, updated_by: user.id, updated_at: new Date().toISOString() })
      .eq("id", stateId);
    fetchData();
  }

  async function updateStatus(stateId: string, status: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("student_process_state")
      .update({ status, updated_by: user.id, updated_at: new Date().toISOString() })
      .eq("id", stateId);
    fetchData();
  }

  const processNames = Object.keys(grouped).sort();
  const totalActive = filteredStates.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-pulse text-text-secondary text-sm">Loading checklists...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading font-bold text-xl text-text-primary">Checklists</h1>
          <p className="text-xs text-text-tertiary mt-0.5">
            {totalActive} active checklist{totalActive !== 1 ? "s" : ""} across {processNames.length} process{processNames.length !== 1 ? "es" : ""}
          </p>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-0.5">
          {(["in_progress", "paused", "completed", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f ? "bg-white text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {f === "in_progress" ? "Active" : f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {processNames.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
          <span className="material-symbols-outlined text-[40px] text-text-tertiary mb-2">checklist</span>
          <p className="text-text-tertiary text-sm">No checklists found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {processNames.map((processName) => {
            const items = grouped[processName];
            const allSteps = getSteps(processName);
            const isExpanded = expandedProcess === processName;

            return (
              <div key={processName} className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                <button
                  onClick={() => setExpandedProcess(isExpanded ? null : processName)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-[20px] text-text-secondary">
                      {isExpanded ? "expand_more" : "chevron_right"}
                    </span>
                    <div className="text-left">
                      <h2 className="font-heading font-semibold text-sm text-text-primary">
                        {PROCESS_LABELS[processName] || processName.replace(/_/g, " ")}
                      </h2>
                      <p className="text-xs text-text-tertiary mt-0.5">
                        {items.length} student{items.length !== 1 ? "s" : ""} · {allSteps.length} steps
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {items.map((item) => {
                      const visSteps = getVisibleSteps(item);
                      const completedCount = (item.completed_steps || []).filter(s => visSteps.some(v => v.order === s)).length;
                      const pct = visSteps.length > 0 ? Math.round((completedCount / visSteps.length) * 100) : 0;
                      return (
                        <div key={item.id} title={`${item.students?.display_id || "?"}: ${pct}%`} className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
                          <svg viewBox="0 0 36 36" className="w-5 h-5 -rotate-90">
                            <circle cx="18" cy="18" r="14" fill="none" stroke="#e5e7eb" strokeWidth="4" />
                            <circle cx="18" cy="18" r="14" fill="none" stroke={pct === 100 ? "#22c55e" : "#8b5cf6"} strokeWidth="4" strokeDasharray={`${pct * 0.88} 88`} strokeLinecap="round" />
                          </svg>
                        </div>
                      );
                    })}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-100">
                    {items.map((item) => {
                      const visibleSteps = getVisibleSteps(item);
                      const completedSet = new Set(item.completed_steps || []);
                      const completedCount = visibleSteps.filter(s => completedSet.has(s.order)).length;
                      const pct = visibleSteps.length > 0 ? Math.round((completedCount / visibleSteps.length) * 100) : 0;
                      const nextStep = getNextBlockingStep(item);
                      const isStudentExpanded = expandedStudent === item.id;

                      return (
                        <div key={item.id} className="border-t border-gray-50 first:border-t-0">
                          <button
                            onClick={() => setExpandedStudent(isStudentExpanded ? null : item.id)}
                            className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50/50 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <span className="material-symbols-outlined text-[18px] text-text-tertiary">
                                {isStudentExpanded ? "expand_more" : "chevron_right"}
                              </span>
                              <div className="text-left">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-text-primary">{item.students?.display_id || "Unknown"}</span>
                                  <span className="text-sm text-text-secondary">
                                    {item.students ? `${item.students.first_name} ${item.students.last_name}` : ""}
                                  </span>
                                  {item.status === "paused" && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Paused</span>}
                                  {item.status === "completed" && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Done</span>}
                                  {(item.active_branches || []).length > 0 && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                                      +{(item.active_branches || []).join(", ")}
                                    </span>
                                  )}
                                </div>
                                {nextStep && item.status !== "completed" && (
                                  <p className="text-xs text-text-tertiary mt-0.5">
                                    Next: <span className="text-accent font-medium">{nextStep.name}</span>
                                    {nextStep.step_type && nextStep.step_type !== "check" && (
                                      <span className="text-text-tertiary ml-1">({nextStep.step_type})</span>
                                    )}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              {item.blocked_on && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-600 font-medium">Blocked</span>}
                              <div className="flex items-center gap-2">
                                <div className="w-24 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                  <div className={`h-full rounded-full transition-all ${pct === 100 ? "bg-green-500" : "bg-accent"}`} style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-xs text-text-tertiary font-medium w-8 text-right">{pct}%</span>
                              </div>
                            </div>
                          </button>

                          {isStudentExpanded && (
                            <div className="px-5 pb-4 pt-1">
                              {/* Controls */}
                              <div className="flex items-center gap-2 mb-3">
                                {item.status !== "completed" && (
                                  <button onClick={() => updateStatus(item.id, item.status === "paused" ? "in_progress" : "paused")}
                                    className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-text-secondary hover:bg-gray-50 font-medium">
                                    {item.status === "paused" ? "Resume" : "Pause"}
                                  </button>
                                )}
                                {item.status === "completed" && (
                                  <button onClick={() => updateStatus(item.id, "in_progress")}
                                    className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-text-secondary hover:bg-gray-50 font-medium">
                                    Reopen
                                  </button>
                                )}
                                <div className="flex-1" />
                                <input
                                  placeholder="Blocked on..."
                                  defaultValue={item.blocked_on || ""}
                                  onBlur={(e) => updateBlockedOn(item.id, e.target.value)}
                                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                                  className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 bg-white w-48 focus:outline-none focus:ring-1 focus:ring-accent/30 text-text-secondary placeholder:text-text-tertiary"
                                />
                              </div>

                              {/* Steps */}
                              <div className="space-y-0.5">
                                {visibleSteps.map((step) => {
                                  const isDone = completedSet.has(step.order);
                                  const isNext = nextStep?.order === step.order && item.status !== "completed";
                                  const isSaving = saving === item.id;
                                  const stepType = step.step_type || "check";
                                  const sd = getStepDataForStep(item.id, step.order);
                                  const sentEmails = (sd?.emails || []).filter(e => e.sent_at);
                                  const hasDraft = (sd?.emails || []).some(e => !e.sent_at);
                                  const entityKey = `${item.id}_${step.order}`;
                                  const linkedEntities = expandedEntities[entityKey];
                                  const isComposing = composingEmail?.stateId === item.id && composingEmail?.stepOrder === step.order;
                                  const isBranch = !!step.branch;

                                  return (
                                    <div key={step.order}>
                                      <div className={`flex items-start gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                                        isNext ? "bg-accent/5 border border-accent/20" :
                                        isBranch ? "bg-purple-50/50 border border-purple-100/50 ml-4" :
                                        "hover:bg-gray-50"
                                      }`}>
                                        {/* Step type icon / checkbox */}
                                        {stepType === "check" ? (
                                          <button
                                            onClick={() => toggleStep(item.id, step.order, item.completed_steps || [])}
                                            disabled={isSaving}
                                            className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                              isDone ? "bg-green-500 border-green-500 text-white" : isNext ? "border-accent" : "border-gray-300"
                                            } ${isSaving ? "opacity-50" : "hover:border-accent"}`}
                                          >
                                            {isDone && <span className="material-symbols-outlined text-[14px]">check</span>}
                                          </button>
                                        ) : (
                                          <div className={`mt-0.5 w-5 h-5 flex items-center justify-center flex-shrink-0 ${isDone ? "text-green-500" : isNext ? "text-accent" : "text-text-tertiary"}`}>
                                            <span className="material-symbols-outlined text-[18px]">
                                              {isDone ? "check_circle" : STEP_TYPE_ICONS[stepType]}
                                            </span>
                                          </div>
                                        )}

                                        {/* Step content */}
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`text-sm ${isDone ? "text-text-tertiary line-through" : "text-text-primary"} ${isNext ? "font-medium" : ""}`}>
                                              {step.name}
                                            </span>
                                            {isNext && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/10 text-accent font-semibold">NEXT</span>}
                                            {step.recurring && <span className="material-symbols-outlined text-[14px] text-text-tertiary" title="Recurring">replay</span>}
                                            {isBranch && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-600 font-medium">{step.branch}</span>}
                                            {sentEmails.length > 0 && (
                                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium flex items-center gap-0.5">
                                                <span className="material-symbols-outlined text-[12px]">check</span>
                                                {sentEmails.length} sent
                                              </span>
                                            )}
                                            {hasDraft && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Draft saved</span>}
                                            {sd?.decision_value && (
                                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                                                {sd.decision_value}
                                              </span>
                                            )}
                                          </div>

                                          {/* Meta row */}
                                          <div className="flex items-center gap-3 mt-0.5">
                                            {step.typically_responsible && <span className="text-[11px] text-text-tertiary">{step.typically_responsible}</span>}
                                            {step.expected_duration_days && <span className="text-[11px] text-text-tertiary">{step.expected_duration_days}d</span>}
                                            {step.notes && <span className="text-[11px] text-text-tertiary italic truncate max-w-[250px]">{step.notes}</span>}
                                          </div>

                                          {/* Action buttons row */}
                                          {!isDone && (
                                            <div className="flex items-center gap-2 mt-2">
                                              {stepType === "email" && (
                                                <button onClick={() => openEmailComposer(item.id, step.order, step)}
                                                  className="text-xs px-3 py-1.5 rounded-lg bg-accent/10 text-accent font-medium hover:bg-accent/20 flex items-center gap-1">
                                                  <span className="material-symbols-outlined text-[14px]">edit</span>
                                                  {step.action_config?.label || "Draft Email"}
                                                </button>
                                              )}
                                              {stepType === "action" && (
                                                <button onClick={() => toggleStep(item.id, step.order, item.completed_steps || [])}
                                                  className="text-xs px-3 py-1.5 rounded-lg bg-accent/10 text-accent font-medium hover:bg-accent/20 flex items-center gap-1">
                                                  <span className="material-symbols-outlined text-[14px]">play_arrow</span>
                                                  {step.action_config?.label || "Do Action"}
                                                </button>
                                              )}
                                              {stepType === "decision" && !sd?.decision_value && step.conditions && (
                                                <div className="flex items-center gap-1.5">
                                                  {step.conditions.map((cond, ci) => (
                                                    <button key={ci}
                                                      onClick={() => handleDecision(item.id, step.order, cond.if, cond.then_branch)}
                                                      className="text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 font-medium hover:bg-blue-100 border border-blue-200">
                                                      {cond.if.replace(/_/g, " ")}
                                                    </button>
                                                  ))}
                                                </div>
                                              )}
                                              {step.linked_data && step.linked_data.length > 0 && (
                                                <button onClick={() => fetchLinkedEntities(item.id, step.order, step)}
                                                  className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-text-tertiary hover:bg-gray-50 flex items-center gap-1">
                                                  <span className="material-symbols-outlined text-[14px]">link</span>
                                                  {linkedEntities ? "Hide data" : "Show linked data"}
                                                </button>
                                              )}
                                            </div>
                                          )}

                                          {/* Linked entities panel */}
                                          {linkedEntities && (
                                            <div className="mt-2 space-y-2">
                                              {linkedEntities.map((eg, ei) => (
                                                <div key={ei} className="rounded-lg border border-gray-200 bg-gray-50/50 p-2.5">
                                                  <p className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wide mb-1.5">{eg.label}</p>
                                                  {eg.rows.length === 0 ? (
                                                    <p className="text-xs text-text-tertiary italic">No records found</p>
                                                  ) : (
                                                    <div className="space-y-1">
                                                      {eg.rows.map((row: EntityData, ri: number) => (
                                                        <div key={ri} className="flex flex-wrap gap-x-4 gap-y-0.5">
                                                          {eg.fields.map((f: string) => (
                                                            <span key={f} className="text-xs text-text-secondary">
                                                              <span className="text-text-tertiary">{f.replace(/_/g, " ")}:</span>{" "}
                                                              <span className="font-medium">{row[f] ?? "—"}</span>
                                                            </span>
                                                          ))}
                                                        </div>
                                                      ))}
                                                    </div>
                                                  )}
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>

                                        <span className="text-xs text-text-tertiary font-mono mt-0.5">{step.order}</span>
                                      </div>

                                      {/* Inline email composer */}
                                      {isComposing && (
                                        <div className="ml-8 mr-3 mt-1 mb-2 rounded-xl border border-accent/20 bg-accent/5 p-4">
                                          <div className="space-y-2">
                                            <div className="flex items-center gap-2">
                                              <label className="text-xs text-text-tertiary w-16">To:</label>
                                              <input value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="recipient@email.com"
                                                className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-accent/30" />
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <label className="text-xs text-text-tertiary w-16">Subject:</label>
                                              <input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)}
                                                className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-accent/30" />
                                            </div>
                                            <textarea value={emailBody} onChange={(e) => setEmailBody(e.target.value)}
                                              rows={6} className="w-full text-xs px-2.5 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-accent/30 resize-y" />
                                          </div>
                                          <div className="flex items-center gap-2 mt-3">
                                            <button onClick={handleSendStepEmail} disabled={sendingEmail || !emailTo}
                                              className="text-xs px-4 py-1.5 rounded-lg bg-accent text-white font-medium hover:bg-accent/90 disabled:opacity-50">
                                              {sendingEmail ? "Sending..." : "Send"}
                                            </button>
                                            <button onClick={saveDraftEmail}
                                              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-text-secondary hover:bg-gray-50 font-medium">
                                              Save draft
                                            </button>
                                            <button onClick={() => setComposingEmail(null)}
                                              className="text-xs px-3 py-1.5 text-text-tertiary hover:text-text-secondary">
                                              Cancel
                                            </button>
                                          </div>
                                        </div>
                                      )}

                                      {/* Sent emails history */}
                                      {sentEmails.length > 0 && !isComposing && (
                                        <div className="ml-8 mr-3 mt-1 mb-1">
                                          {sentEmails.map((em, ei) => (
                                            <div key={ei} className="text-[11px] text-text-tertiary flex items-center gap-2 py-0.5">
                                              <span className="material-symbols-outlined text-green-500 text-[12px]">check_circle</span>
                                              Sent to {em.draft_to} — &quot;{em.draft_subject}&quot;
                                              {em.sent_at && <span>· {new Date(em.sent_at).toLocaleDateString()}</span>}
                                              {em.sent_by && users[em.sent_by] && <span>· by {users[em.sent_by]}</span>}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
