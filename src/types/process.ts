/**
 * Smart Checklist Types
 * Enhanced process definitions with step types, linked data, email storage, and conditional logic.
 */

// ── Step Definition (stored in process_definitions.definition JSONB) ──

export type StepType = "check" | "action" | "email" | "decision";

export type LinkedDataConfig = {
  entity_type: "student" | "host" | "driver" | "university" | "transport" | "payment" | "homestay";
  relationship: "assigned" | "related" | "created_by_step";
  label: string; // "Assigned driver", "Host family"
  fields_to_show?: string[];
};

export type EmailTemplate = {
  to_field: string; // entity type key or "manual"
  subject_template: string; // "Flight details for {{student.display_id}}"
  body_template: string;
};

export type ActionConfig = {
  action_type: "send_email" | "create_record" | "update_field" | "link_entity";
  label: string; // Button text: "Send Confirmation", "Assign Driver"
  email_template?: EmailTemplate;
};

export type StepCondition = {
  if: string;
  then: string; // "continue" | "skip" | "repeat_step_N" | "activate_branch"
  then_branch?: string;
  else?: string;
};

export type VisibilityCondition = {
  field: string; // "student.is_minor" or "decision.step_3.value"
  operator: "eq" | "neq" | "exists" | "in";
  value: unknown;
};

export type StepDefinition = {
  order: number;
  name: string;
  step_type?: StepType; // defaults to "check" if absent (backwards compat)
  required_inputs?: string[];
  expected_duration_days?: number | null;
  typically_responsible?: string;
  notes?: string;
  recurring?: boolean;

  // Linked data shown with this step
  linked_data?: LinkedDataConfig[];

  // Action/email configuration
  action_config?: ActionConfig;

  // Conditional logic
  conditions?: StepCondition[];

  // When should this step be visible?
  visible_when?: VisibilityCondition[];

  // Branch grouping (steps only shown if branch is activated)
  branch?: string;
};

export type ProcessDefinitionData = {
  steps: StepDefinition[];
};

// ── Process Definition (DB row) ──

export type ProcessDefinition = {
  id: string;
  name: string;
  version: number;
  definition: ProcessDefinitionData;
  is_current: boolean;
  created_by: string;
  created_at: string;
};

// ── Runtime Step Data (process_step_data table) ──

export type LinkedEntity = {
  type: string;
  id: string;
  display_id: string;
  label: string;
};

export type StepEmail = {
  draft_to: string;
  draft_subject: string;
  draft_body: string;
  sent_at: string | null;
  sent_by: string | null;
};

export type ProcessStepData = {
  id: string;
  process_state_id: string;
  step_order: number;
  completed_at: string | null;
  completed_by: string | null;
  skipped: boolean;
  skip_reason: string | null;
  linked_entities: LinkedEntity[];
  emails: StepEmail[];
  decision_value: string | null;
  decision_metadata: Record<string, unknown> | null;
  notes: string | null;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

// ── Student Process State (DB row) ──

export type StudentProcessState = {
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
  updated_by: string | null;
  updated_at: string;
  created_by: string;
  created_at: string;
  // Joined
  students?: { display_id: string; first_name: string; last_name: string } | null;
};

// ── Utility: resolve which steps are visible given state ──

export function resolveVisibleSteps(
  steps: StepDefinition[],
  activeBranches: string[],
  skippedSteps: number[],
  stepData: ProcessStepData[],
): StepDefinition[] {
  const branchSet = new Set(activeBranches);
  const skipSet = new Set(skippedSteps);
  const decisions = new Map<number, string>();

  // Collect decisions from step data
  for (const sd of stepData) {
    if (sd.decision_value) {
      decisions.set(sd.step_order, sd.decision_value);
    }
  }

  return steps.filter((step) => {
    // Skip if explicitly skipped
    if (skipSet.has(step.order)) return false;

    // Branch filtering: if step belongs to a branch, only show if branch is active
    if (step.branch && !branchSet.has(step.branch)) return false;

    // Visibility conditions
    if (step.visible_when && step.visible_when.length > 0) {
      return step.visible_when.every((cond) => {
        // Parse field: "decision.step_3.value" → check decision at step 3
        const decisionMatch = cond.field.match(/^decision\.step_(\d+)\.value$/);
        if (decisionMatch) {
          const decStep = parseInt(decisionMatch[1]);
          const decVal = decisions.get(decStep);
          return evaluateCondition(decVal, cond.operator, cond.value);
        }
        // For now, other field types pass through (would need student data)
        return true;
      });
    }

    return true;
  });
}

function evaluateCondition(actual: unknown, operator: string, expected: unknown): boolean {
  switch (operator) {
    case "eq": return actual === expected;
    case "neq": return actual !== expected;
    case "exists": return actual !== null && actual !== undefined;
    case "in": return Array.isArray(expected) && expected.includes(actual);
    default: return true;
  }
}
