"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  StepDefinition,
  StepType,
  LinkedDataConfig,
  ActionConfig,
  StepCondition,
  VisibilityCondition,
  EmailTemplate,
} from "@/types/process";

type ProcessDefinition = {
  id: string;
  name: string;
  version: number;
  definition: { steps: StepDefinition[] };
  is_current: boolean;
  created_by: string;
  created_at: string;
};

const PROCESS_LABELS: Record<string, string> = {
  academic_placement: "Academic Placement",
  homestay_intake: "Homestay Intake",
  custodianship: "Custodianship",
  airport_arrival: "Airport Arrival",
  airport_departure: "Airport Departure",
};

const STEP_TYPES: { value: StepType; label: string; icon: string }[] = [
  { value: "check", label: "Checkbox", icon: "check_box" },
  { value: "action", label: "Action", icon: "play_circle" },
  { value: "email", label: "Email", icon: "mail" },
  { value: "decision", label: "Decision", icon: "call_split" },
];

const ENTITY_TYPES = ["student", "host", "driver", "university", "transport", "payment", "homestay"] as const;
const RELATIONSHIPS = ["assigned", "related", "created_by_step"] as const;
const ACTION_TYPES = ["send_email", "create_record", "update_field", "link_entity"] as const;

export default function ProcessesPage() {
  const [processes, setProcesses] = useState<ProcessDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingSteps, setEditingSteps] = useState<StepDefinition[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addingNew, setAddingNew] = useState(false);
  const [newProcessName, setNewProcessName] = useState("");
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"basic" | "linked" | "action" | "conditions">("basic");

  const supabase = createClient();

  const fetchProcesses = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("process_definitions")
      .select("*")
      .eq("is_current", true)
      .order("name");
    if (data) setProcesses(data);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchProcesses(); }, [fetchProcesses]);

  const selected = processes.find((p) => p.id === selectedId);

  function handleSelect(id: string) {
    if (hasChanges && !confirm("You have unsaved changes. Discard them?")) return;
    setSelectedId(id);
    const proc = processes.find((p) => p.id === id);
    if (proc) {
      setEditingSteps(JSON.parse(JSON.stringify(proc.definition.steps)));
      setHasChanges(false);
      setExpandedStep(null);
    }
  }

  function updateStep(index: number, updates: Partial<StepDefinition>) {
    const updated = [...editingSteps];
    updated[index] = { ...updated[index], ...updates };
    setEditingSteps(updated);
    setHasChanges(true);
  }

  function addStep() {
    const newOrder = editingSteps.length > 0 ? Math.max(...editingSteps.map((s) => s.order)) + 1 : 1;
    setEditingSteps([...editingSteps, { order: newOrder, name: "", step_type: "check" }]);
    setHasChanges(true);
    setExpandedStep(newOrder);
  }

  function removeStep(index: number) {
    const updated = editingSteps.filter((_, i) => i !== index);
    updated.forEach((s, i) => (s.order = i + 1));
    setEditingSteps(updated);
    setHasChanges(true);
  }

  function moveStep(index: number, direction: "up" | "down") {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === editingSteps.length - 1) return;
    const updated = [...editingSteps];
    const swapIdx = direction === "up" ? index - 1 : index + 1;
    [updated[index], updated[swapIdx]] = [updated[swapIdx], updated[index]];
    updated.forEach((s, i) => (s.order = i + 1));
    setEditingSteps(updated);
    setHasChanges(true);
  }

  function duplicateStep(index: number) {
    const step = editingSteps[index];
    const newStep: StepDefinition = {
      ...JSON.parse(JSON.stringify(step)),
      order: step.order + 1,
      name: step.name + " (copy)",
    };
    const updated = [...editingSteps];
    updated.splice(index + 1, 0, newStep);
    updated.forEach((s, i) => (s.order = i + 1));
    setEditingSteps(updated);
    setHasChanges(true);
  }

  // Linked data helpers
  function addLinkedData(stepIndex: number) {
    const step = editingSteps[stepIndex];
    const linked: LinkedDataConfig[] = step.linked_data || [];
    linked.push({ entity_type: "student", relationship: "assigned", label: "" });
    updateStep(stepIndex, { linked_data: linked });
  }

  function updateLinkedData(stepIndex: number, ldIndex: number, updates: Partial<LinkedDataConfig>) {
    const step = editingSteps[stepIndex];
    const linked = [...(step.linked_data || [])];
    linked[ldIndex] = { ...linked[ldIndex], ...updates };
    updateStep(stepIndex, { linked_data: linked });
  }

  function removeLinkedData(stepIndex: number, ldIndex: number) {
    const step = editingSteps[stepIndex];
    const linked = (step.linked_data || []).filter((_, i) => i !== ldIndex);
    updateStep(stepIndex, { linked_data: linked.length > 0 ? linked : undefined });
  }

  // Condition helpers
  function addCondition(stepIndex: number) {
    const step = editingSteps[stepIndex];
    const conds: StepCondition[] = step.conditions || [];
    conds.push({ if: "", then: "continue" });
    updateStep(stepIndex, { conditions: conds });
  }

  function updateCondition(stepIndex: number, condIndex: number, updates: Partial<StepCondition>) {
    const step = editingSteps[stepIndex];
    const conds = [...(step.conditions || [])];
    conds[condIndex] = { ...conds[condIndex], ...updates };
    updateStep(stepIndex, { conditions: conds });
  }

  function removeCondition(stepIndex: number, condIndex: number) {
    const step = editingSteps[stepIndex];
    const conds = (step.conditions || []).filter((_, i) => i !== condIndex);
    updateStep(stepIndex, { conditions: conds.length > 0 ? conds : undefined });
  }

  // Visibility condition helpers
  function addVisibility(stepIndex: number) {
    const step = editingSteps[stepIndex];
    const vis: VisibilityCondition[] = step.visible_when || [];
    vis.push({ field: "", operator: "eq", value: "" });
    updateStep(stepIndex, { visible_when: vis });
  }

  function updateVisibility(stepIndex: number, vIndex: number, updates: Partial<VisibilityCondition>) {
    const step = editingSteps[stepIndex];
    const vis = [...(step.visible_when || [])];
    vis[vIndex] = { ...vis[vIndex], ...updates };
    updateStep(stepIndex, { visible_when: vis });
  }

  function removeVisibility(stepIndex: number, vIndex: number) {
    const step = editingSteps[stepIndex];
    const vis = (step.visible_when || []).filter((_, i) => i !== vIndex);
    updateStep(stepIndex, { visible_when: vis.length > 0 ? vis : undefined });
  }

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    await supabase
      .from("process_definitions")
      .update({ is_current: false })
      .eq("id", selected.id);

    await supabase.from("process_definitions").insert({
      name: selected.name,
      version: selected.version + 1,
      definition: { steps: editingSteps },
      is_current: true,
      created_by: user.id,
    });

    setHasChanges(false);
    setSaving(false);
    await fetchProcesses();
  }

  async function handleAddProcess() {
    if (!newProcessName.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const slug = newProcessName.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");

    await supabase.from("process_definitions").insert({
      name: slug,
      version: 1,
      definition: { steps: [{ order: 1, name: "First step", step_type: "check" as StepType }] },
      is_current: true,
      created_by: user.id,
    });

    setAddingNew(false);
    setNewProcessName("");
    await fetchProcesses();
  }

  // Get all unique branch names from steps
  const branchNames = [...new Set(editingSteps.filter(s => s.branch).map(s => s.branch!))];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading font-bold text-xl text-text-primary">Process Editor</h1>
        <button
          onClick={() => setAddingNew(true)}
          className="px-3 py-1.5 rounded-xl bg-text-primary text-white text-sm font-semibold hover:opacity-90"
        >
          + New process
        </button>
      </div>

      {addingNew && (
        <div className="mb-4 flex items-center gap-2">
          <input
            autoFocus
            value={newProcessName}
            onChange={(e) => setNewProcessName(e.target.value)}
            placeholder="Process name (e.g. Student Onboarding)"
            className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm w-64 focus:outline-none focus:ring-2 focus:ring-accent/30"
            onKeyDown={(e) => e.key === "Enter" && handleAddProcess()}
          />
          <button onClick={handleAddProcess} className="px-3 py-1.5 rounded-xl bg-text-primary text-white text-sm font-semibold">
            Create
          </button>
          <button onClick={() => { setAddingNew(false); setNewProcessName(""); }} className="px-3 py-1.5 text-text-secondary text-sm">
            Cancel
          </button>
        </div>
      )}

      <div className="flex gap-6">
        {/* Process list */}
        <div className="w-56 flex-shrink-0">
          <div className="space-y-1">
            {loading ? (
              <p className="text-text-tertiary text-sm py-4">Loading...</p>
            ) : processes.length === 0 ? (
              <p className="text-text-tertiary text-sm py-4">No processes defined yet.</p>
            ) : (
              processes.map((proc) => (
                <button
                  key={proc.id}
                  onClick={() => handleSelect(proc.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    selectedId === proc.id
                      ? "bg-accent/10 text-text-primary"
                      : "text-text-secondary hover:bg-gray-100"
                  }`}
                >
                  <div>{PROCESS_LABELS[proc.name] || proc.name.replace(/_/g, " ")}</div>
                  <div className="text-xs text-text-tertiary mt-0.5">
                    v{proc.version} · {proc.definition.steps.length} steps
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Step editor */}
        <div className="flex-1 min-w-0">
          {!selected ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
              <p className="text-text-tertiary text-sm">Select a process to edit its steps.</p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-heading font-semibold text-lg text-text-primary">
                    {PROCESS_LABELS[selected.name] || selected.name.replace(/_/g, " ")}
                  </h2>
                  <p className="text-xs text-text-tertiary mt-0.5">
                    Version {selected.version} · {editingSteps.length} steps
                    {branchNames.length > 0 && ` · ${branchNames.length} branches`}
                    {hasChanges && <span className="text-accent ml-2">· Unsaved changes</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={addStep}
                    className="px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-text-secondary hover:bg-gray-50"
                  >
                    + Add step
                  </button>
                  {hasChanges && (
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="px-4 py-1.5 rounded-xl bg-text-primary text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                    >
                      {saving ? "Saving..." : "Save as v" + (selected.version + 1)}
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                {editingSteps.map((step, i) => {
                  const isExpanded = expandedStep === step.order;
                  const stepType = step.step_type || "check";
                  const typeInfo = STEP_TYPES.find(t => t.value === stepType) || STEP_TYPES[0];

                  return (
                    <div
                      key={i}
                      className={`rounded-2xl border bg-white overflow-hidden transition-colors ${
                        isExpanded ? "border-accent/30 shadow-sm" : "border-gray-200"
                      } ${step.branch ? "ml-6 border-l-2 border-l-purple-300" : ""}`}
                    >
                      {/* Step header row */}
                      <div className="flex items-center gap-3 p-4 group">
                        {/* Order number */}
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${
                          stepType === "decision" ? "bg-purple-100 text-purple-600" :
                          stepType === "email" ? "bg-blue-100 text-blue-600" :
                          stepType === "action" ? "bg-amber-100 text-amber-600" :
                          "bg-gray-100 text-text-secondary"
                        }`}>
                          {step.order}
                        </div>

                        {/* Step type icon */}
                        <span className={`material-symbols-outlined text-[18px] ${
                          stepType === "decision" ? "text-purple-400" :
                          stepType === "email" ? "text-blue-400" :
                          stepType === "action" ? "text-amber-400" :
                          "text-gray-400"
                        }`}>
                          {typeInfo.icon}
                        </span>

                        {/* Name */}
                        <input
                          value={step.name}
                          onChange={(e) => updateStep(i, { name: e.target.value })}
                          placeholder="Step name"
                          className="flex-1 text-sm font-medium text-text-primary bg-transparent focus:outline-none focus:bg-gray-50 rounded px-1 -mx-1 py-0.5"
                        />

                        {/* Badges */}
                        <div className="flex items-center gap-1.5">
                          {step.branch && (
                            <span className="px-2 py-0.5 rounded-lg bg-purple-50 text-purple-600 text-[10px] font-medium">
                              {step.branch}
                            </span>
                          )}
                          {step.linked_data && step.linked_data.length > 0 && (
                            <span className="px-2 py-0.5 rounded-lg bg-cyan-50 text-cyan-600 text-[10px] font-medium">
                              {step.linked_data.length} linked
                            </span>
                          )}
                          {step.conditions && step.conditions.length > 0 && (
                            <span className="px-2 py-0.5 rounded-lg bg-amber-50 text-amber-600 text-[10px] font-medium">
                              {step.conditions.length} cond
                            </span>
                          )}
                        </div>

                        {/* Expand toggle */}
                        <button
                          onClick={() => setExpandedStep(isExpanded ? null : step.order)}
                          className="p-1 text-text-tertiary hover:text-text-primary transition-colors"
                        >
                          <span className="material-symbols-outlined text-[18px]">
                            {isExpanded ? "expand_less" : "expand_more"}
                          </span>
                        </button>

                        {/* Actions */}
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => moveStep(i, "up")} disabled={i === 0} className="p-1 text-text-tertiary hover:text-text-primary disabled:opacity-30" title="Move up">
                            <span className="material-symbols-outlined text-[16px]">arrow_upward</span>
                          </button>
                          <button onClick={() => moveStep(i, "down")} disabled={i === editingSteps.length - 1} className="p-1 text-text-tertiary hover:text-text-primary disabled:opacity-30" title="Move down">
                            <span className="material-symbols-outlined text-[16px]">arrow_downward</span>
                          </button>
                          <button onClick={() => duplicateStep(i)} className="p-1 text-text-tertiary hover:text-text-primary" title="Duplicate">
                            <span className="material-symbols-outlined text-[16px]">content_copy</span>
                          </button>
                          <button onClick={() => removeStep(i)} className="p-1 text-text-tertiary hover:text-urgent" title="Remove step">
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                          </button>
                        </div>
                      </div>

                      {/* Expanded editor */}
                      {isExpanded && (
                        <div className="border-t border-gray-100">
                          {/* Tab bar */}
                          <div className="flex border-b border-gray-100 px-4">
                            {(["basic", "linked", "action", "conditions"] as const).map(tab => (
                              <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors capitalize ${
                                  activeTab === tab
                                    ? "border-accent text-text-primary"
                                    : "border-transparent text-text-tertiary hover:text-text-secondary"
                                }`}
                              >
                                {tab === "linked" ? "Linked Data" : tab === "action" ? "Action/Email" : tab}
                              </button>
                            ))}
                          </div>

                          <div className="p-4 space-y-4">
                            {/* ── BASIC TAB ── */}
                            {activeTab === "basic" && (
                              <>
                                {/* Step type selector */}
                                <div>
                                  <label className="text-xs text-text-tertiary font-medium mb-1.5 block">Step type</label>
                                  <div className="flex gap-2">
                                    {STEP_TYPES.map(t => (
                                      <button
                                        key={t.value}
                                        onClick={() => updateStep(i, { step_type: t.value })}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                                          stepType === t.value
                                            ? "bg-accent/10 text-accent ring-1 ring-accent/20"
                                            : "bg-gray-50 text-text-secondary hover:bg-gray-100"
                                        }`}
                                      >
                                        <span className="material-symbols-outlined text-[16px]">{t.icon}</span>
                                        {t.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                {/* Basic fields */}
                                <div className="grid grid-cols-3 gap-3">
                                  <div>
                                    <label className="text-xs text-text-tertiary font-medium mb-1 block">Duration (days)</label>
                                    <input
                                      type="number"
                                      value={step.expected_duration_days ?? ""}
                                      onChange={(e) => updateStep(i, { expected_duration_days: e.target.value ? Number(e.target.value) : null })}
                                      className="w-full px-2.5 py-1.5 rounded-xl border border-gray-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-accent/20"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs text-text-tertiary font-medium mb-1 block">Responsible</label>
                                    <input
                                      value={step.typically_responsible || ""}
                                      onChange={(e) => updateStep(i, { typically_responsible: e.target.value || undefined })}
                                      placeholder="e.g. advisor"
                                      className="w-full px-2.5 py-1.5 rounded-xl border border-gray-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-accent/20"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs text-text-tertiary font-medium mb-1 block">Branch</label>
                                    <input
                                      value={step.branch || ""}
                                      onChange={(e) => updateStep(i, { branch: e.target.value || undefined })}
                                      placeholder="e.g. custodianship"
                                      className="w-full px-2.5 py-1.5 rounded-xl border border-gray-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-accent/20"
                                    />
                                  </div>
                                </div>

                                <div>
                                  <label className="text-xs text-text-tertiary font-medium mb-1 block">Notes</label>
                                  <textarea
                                    value={step.notes || ""}
                                    onChange={(e) => updateStep(i, { notes: e.target.value || undefined })}
                                    placeholder="Additional notes for this step..."
                                    rows={2}
                                    className="w-full px-2.5 py-1.5 rounded-xl border border-gray-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-accent/20 resize-none"
                                  />
                                </div>

                                <label className="flex items-center gap-2 text-xs text-text-secondary">
                                  <input
                                    type="checkbox"
                                    checked={step.recurring || false}
                                    onChange={(e) => updateStep(i, { recurring: e.target.checked || undefined })}
                                    className="rounded"
                                  />
                                  Recurring step
                                </label>
                              </>
                            )}

                            {/* ── LINKED DATA TAB ── */}
                            {activeTab === "linked" && (
                              <>
                                <div className="flex items-center justify-between">
                                  <p className="text-xs text-text-tertiary">Entity data shown alongside this step at runtime.</p>
                                  <button
                                    onClick={() => addLinkedData(i)}
                                    className="text-xs text-accent font-medium hover:underline"
                                  >
                                    + Add linked data
                                  </button>
                                </div>
                                {(!step.linked_data || step.linked_data.length === 0) ? (
                                  <p className="text-xs text-text-tertiary py-4 text-center">No linked data configured.</p>
                                ) : (
                                  <div className="space-y-3">
                                    {step.linked_data!.map((ld, li) => (
                                      <div key={li} className="rounded-xl bg-gray-50 p-3 space-y-2">
                                        <div className="flex items-center justify-between">
                                          <span className="text-xs font-medium text-text-secondary">Link #{li + 1}</span>
                                          <button onClick={() => removeLinkedData(i, li)} className="text-text-tertiary hover:text-urgent">
                                            <span className="material-symbols-outlined text-[14px]">close</span>
                                          </button>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2">
                                          <div>
                                            <label className="text-[10px] text-text-tertiary block mb-0.5">Entity type</label>
                                            <select
                                              value={ld.entity_type}
                                              onChange={(e) => updateLinkedData(i, li, { entity_type: e.target.value as LinkedDataConfig["entity_type"] })}
                                              className="w-full px-2 py-1 rounded-lg border border-gray-200 bg-white text-xs focus:outline-none"
                                            >
                                              {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                            </select>
                                          </div>
                                          <div>
                                            <label className="text-[10px] text-text-tertiary block mb-0.5">Relationship</label>
                                            <select
                                              value={ld.relationship}
                                              onChange={(e) => updateLinkedData(i, li, { relationship: e.target.value as LinkedDataConfig["relationship"] })}
                                              className="w-full px-2 py-1 rounded-lg border border-gray-200 bg-white text-xs focus:outline-none"
                                            >
                                              {RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
                                            </select>
                                          </div>
                                          <div>
                                            <label className="text-[10px] text-text-tertiary block mb-0.5">Label</label>
                                            <input
                                              value={ld.label}
                                              onChange={(e) => updateLinkedData(i, li, { label: e.target.value })}
                                              placeholder="e.g. Assigned driver"
                                              className="w-full px-2 py-1 rounded-lg border border-gray-200 bg-white text-xs focus:outline-none"
                                            />
                                          </div>
                                        </div>
                                        <div>
                                          <label className="text-[10px] text-text-tertiary block mb-0.5">Fields to show (comma-separated)</label>
                                          <input
                                            value={(ld.fields_to_show || []).join(", ")}
                                            onChange={(e) => updateLinkedData(i, li, {
                                              fields_to_show: e.target.value ? e.target.value.split(",").map(f => f.trim()) : undefined
                                            })}
                                            placeholder="e.g. display_id, name, phone"
                                            className="w-full px-2 py-1 rounded-lg border border-gray-200 bg-white text-xs focus:outline-none"
                                          />
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </>
                            )}

                            {/* ── ACTION/EMAIL TAB ── */}
                            {activeTab === "action" && (
                              <>
                                {stepType !== "action" && stepType !== "email" ? (
                                  <p className="text-xs text-text-tertiary py-4 text-center">
                                    Action/email config is only available for &quot;Action&quot; and &quot;Email&quot; step types.
                                  </p>
                                ) : (
                                  <div className="space-y-4">
                                    {/* Action config */}
                                    <div className="grid grid-cols-2 gap-3">
                                      <div>
                                        <label className="text-xs text-text-tertiary font-medium mb-1 block">Action type</label>
                                        <select
                                          value={step.action_config?.action_type || "send_email"}
                                          onChange={(e) => updateStep(i, {
                                            action_config: {
                                              ...(step.action_config || { action_type: "send_email", label: "" }),
                                              action_type: e.target.value as ActionConfig["action_type"],
                                            }
                                          })}
                                          className="w-full px-2.5 py-1.5 rounded-xl border border-gray-200 bg-white text-xs focus:outline-none"
                                        >
                                          {ACTION_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                                        </select>
                                      </div>
                                      <div>
                                        <label className="text-xs text-text-tertiary font-medium mb-1 block">Button label</label>
                                        <input
                                          value={step.action_config?.label || ""}
                                          onChange={(e) => updateStep(i, {
                                            action_config: {
                                              ...(step.action_config || { action_type: "send_email", label: "" }),
                                              label: e.target.value,
                                            }
                                          })}
                                          placeholder="e.g. Send Confirmation"
                                          className="w-full px-2.5 py-1.5 rounded-xl border border-gray-200 bg-white text-xs focus:outline-none"
                                        />
                                      </div>
                                    </div>

                                    {/* Email template (shown for send_email action type) */}
                                    {(step.action_config?.action_type === "send_email" || stepType === "email") && (
                                      <div className="rounded-xl bg-blue-50/50 p-3 space-y-2">
                                        <div className="flex items-center gap-1.5 mb-1">
                                          <span className="material-symbols-outlined text-[14px] text-blue-400">mail</span>
                                          <span className="text-xs font-medium text-blue-600">Email Template</span>
                                        </div>
                                        <div>
                                          <label className="text-[10px] text-text-tertiary block mb-0.5">To field (entity type key or &quot;manual&quot;)</label>
                                          <input
                                            value={step.action_config?.email_template?.to_field || ""}
                                            onChange={(e) => {
                                              const ac = step.action_config || { action_type: "send_email" as const, label: "" };
                                              const et: EmailTemplate = ac.email_template || { to_field: "", subject_template: "", body_template: "" };
                                              updateStep(i, {
                                                action_config: { ...ac, email_template: { ...et, to_field: e.target.value } }
                                              });
                                            }}
                                            placeholder="e.g. student, host, manual"
                                            className="w-full px-2 py-1 rounded-lg border border-gray-200 bg-white text-xs focus:outline-none"
                                          />
                                        </div>
                                        <div>
                                          <label className="text-[10px] text-text-tertiary block mb-0.5">Subject template</label>
                                          <input
                                            value={step.action_config?.email_template?.subject_template || ""}
                                            onChange={(e) => {
                                              const ac = step.action_config || { action_type: "send_email" as const, label: "" };
                                              const et: EmailTemplate = ac.email_template || { to_field: "", subject_template: "", body_template: "" };
                                              updateStep(i, {
                                                action_config: { ...ac, email_template: { ...et, subject_template: e.target.value } }
                                              });
                                            }}
                                            placeholder="e.g. Flight details for {{student.display_id}}"
                                            className="w-full px-2 py-1 rounded-lg border border-gray-200 bg-white text-xs focus:outline-none"
                                          />
                                        </div>
                                        <div>
                                          <label className="text-[10px] text-text-tertiary block mb-0.5">Body template</label>
                                          <textarea
                                            value={step.action_config?.email_template?.body_template || ""}
                                            onChange={(e) => {
                                              const ac = step.action_config || { action_type: "send_email" as const, label: "" };
                                              const et: EmailTemplate = ac.email_template || { to_field: "", subject_template: "", body_template: "" };
                                              updateStep(i, {
                                                action_config: { ...ac, email_template: { ...et, body_template: e.target.value } }
                                              });
                                            }}
                                            rows={3}
                                            placeholder="Dear {{student.first_name}},\n\nYour placement at {{university.name}} is confirmed..."
                                            className="w-full px-2 py-1 rounded-lg border border-gray-200 bg-white text-xs focus:outline-none resize-none"
                                          />
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </>
                            )}

                            {/* ── CONDITIONS TAB ── */}
                            {activeTab === "conditions" && (
                              <>
                                {/* Conditions (if/then for decisions) */}
                                <div>
                                  <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs text-text-tertiary font-medium">Conditions (if/then)</label>
                                    <button onClick={() => addCondition(i)} className="text-xs text-accent font-medium hover:underline">
                                      + Add condition
                                    </button>
                                  </div>
                                  {(!step.conditions || step.conditions.length === 0) ? (
                                    <p className="text-xs text-text-tertiary py-2 text-center">No conditions. Add one for decision branching.</p>
                                  ) : (
                                    <div className="space-y-2">
                                      {step.conditions!.map((cond, ci) => (
                                        <div key={ci} className="flex items-center gap-2 bg-amber-50/50 rounded-xl p-2.5">
                                          <span className="text-[10px] text-amber-600 font-medium w-4">IF</span>
                                          <input
                                            value={cond.if}
                                            onChange={(e) => updateCondition(i, ci, { if: e.target.value })}
                                            placeholder="value or expression"
                                            className="flex-1 px-2 py-1 rounded-lg border border-gray-200 bg-white text-xs focus:outline-none"
                                          />
                                          <span className="text-[10px] text-amber-600 font-medium">THEN</span>
                                          <select
                                            value={cond.then}
                                            onChange={(e) => updateCondition(i, ci, { then: e.target.value })}
                                            className="px-2 py-1 rounded-lg border border-gray-200 bg-white text-xs focus:outline-none"
                                          >
                                            <option value="continue">Continue</option>
                                            <option value="skip">Skip</option>
                                            <option value="activate_branch">Activate branch</option>
                                          </select>
                                          {cond.then === "activate_branch" && (
                                            <input
                                              value={cond.then_branch || ""}
                                              onChange={(e) => updateCondition(i, ci, { then_branch: e.target.value })}
                                              placeholder="branch name"
                                              className="w-28 px-2 py-1 rounded-lg border border-gray-200 bg-white text-xs focus:outline-none"
                                            />
                                          )}
                                          <button onClick={() => removeCondition(i, ci)} className="text-text-tertiary hover:text-urgent">
                                            <span className="material-symbols-outlined text-[14px]">close</span>
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {/* Visibility conditions */}
                                <div className="border-t border-gray-100 pt-4">
                                  <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs text-text-tertiary font-medium">Visibility conditions</label>
                                    <button onClick={() => addVisibility(i)} className="text-xs text-accent font-medium hover:underline">
                                      + Add visibility rule
                                    </button>
                                  </div>
                                  {(!step.visible_when || step.visible_when.length === 0) ? (
                                    <p className="text-xs text-text-tertiary py-2 text-center">Always visible. Add rules to show conditionally.</p>
                                  ) : (
                                    <div className="space-y-2">
                                      {step.visible_when!.map((vis, vi) => (
                                        <div key={vi} className="flex items-center gap-2 bg-gray-50 rounded-xl p-2.5">
                                          <span className="text-[10px] text-text-tertiary font-medium">SHOW IF</span>
                                          <input
                                            value={vis.field}
                                            onChange={(e) => updateVisibility(i, vi, { field: e.target.value })}
                                            placeholder="decision.step_3.value"
                                            className="flex-1 px-2 py-1 rounded-lg border border-gray-200 bg-white text-xs focus:outline-none"
                                          />
                                          <select
                                            value={vis.operator}
                                            onChange={(e) => updateVisibility(i, vi, { operator: e.target.value as VisibilityCondition["operator"] })}
                                            className="px-2 py-1 rounded-lg border border-gray-200 bg-white text-xs focus:outline-none"
                                          >
                                            <option value="eq">equals</option>
                                            <option value="neq">not equals</option>
                                            <option value="exists">exists</option>
                                            <option value="in">in list</option>
                                          </select>
                                          {vis.operator !== "exists" && (
                                            <input
                                              value={String(vis.value || "")}
                                              onChange={(e) => updateVisibility(i, vi, { value: e.target.value })}
                                              placeholder="value"
                                              className="w-28 px-2 py-1 rounded-lg border border-gray-200 bg-white text-xs focus:outline-none"
                                            />
                                          )}
                                          <button onClick={() => removeVisibility(i, vi)} className="text-text-tertiary hover:text-urgent">
                                            <span className="material-symbols-outlined text-[14px]">close</span>
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
