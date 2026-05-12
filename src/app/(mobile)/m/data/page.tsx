"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { timeAgo } from "@/lib/timeago";

type PendingTask = {
  id: string;
  type: "card" | "step" | "payment";
  title: string;
  subtitle?: string;
  urgency?: string;
  due?: string;
  entity?: string;
};

const TABS = [
  { key: "all", label: "All" },
  { key: "cards", label: "Tasks" },
  { key: "students", label: "Students" },
  { key: "payments", label: "Payments" },
];

const urgencyDot: Record<string, string> = {
  urgent: "var(--urgent)",
  medium: "var(--medium)",
  low: "var(--low)",
  info: "var(--info)",
};

export default function DataOverviewPage() {
  const [tab, setTab] = useState("all");
  const [tasks, setTasks] = useState<PendingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const allTasks: PendingTask[] = [];

      // Active action cards
      const { data: cards } = await supabase
        .from("action_cards")
        .select("id, title, urgency, category, context, created_at")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(50);

      if (cards) {
        cards.forEach((c) => {
          allTasks.push({
            id: `card-${c.id}`,
            type: "card",
            title: c.title,
            subtitle: c.context?.slice(0, 80) || c.category,
            urgency: c.urgency,
            due: c.created_at,
          });
        });
      }

      // Students with pending next steps
      const { data: students } = await supabase
        .from("students")
        .select("id, display_id, first_name, last_name, stage, next_step, next_step_date")
        .eq("archived", false)
        .not("next_step", "is", null)
        .order("next_step_date", { ascending: true })
        .limit(30);

      if (students) {
        students.forEach((s) => {
          allTasks.push({
            id: `student-${s.id}`,
            type: "step",
            title: s.next_step || `${s.first_name} - pending`,
            subtitle: `${s.display_id} ${s.first_name} ${s.last_name} — ${s.stage}`,
            due: s.next_step_date,
            entity: s.display_id,
          });
        });
      }

      // Pending payments
      const { data: payments } = await supabase
        .from("payments")
        .select("id, description, amount, due_date, status")
        .eq("status", "pending")
        .order("due_date", { ascending: true })
        .limit(20);

      if (payments) {
        payments.forEach((p) => {
          allTasks.push({
            id: `payment-${p.id}`,
            type: "payment",
            title: p.description || "Payment",
            subtitle: `$${Number(p.amount).toLocaleString("en-CA", { minimumFractionDigits: 2 })}`,
            due: p.due_date,
            urgency: p.due_date && new Date(p.due_date) < new Date() ? "urgent" : "medium",
          });
        });
      }

      setTasks(allTasks);
      setLoading(false);
    }
    load();
  }, [supabase]);

  const filtered = tab === "all"
    ? tasks
    : tab === "cards"
    ? tasks.filter((t) => t.type === "card")
    : tab === "students"
    ? tasks.filter((t) => t.type === "step")
    : tasks.filter((t) => t.type === "payment");

  return (
    <div>
      <h1 className="font-heading font-semibold text-xl text-text-primary mb-4">Overview</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {TABS.map((t) => {
          const count = t.key === "all"
            ? tasks.length
            : t.key === "cards"
            ? tasks.filter((tk) => tk.type === "card").length
            : t.key === "students"
            ? tasks.filter((tk) => tk.type === "step").length
            : tasks.filter((tk) => tk.type === "payment").length;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`text-[13px] font-medium px-3.5 py-1.5 rounded-full whitespace-nowrap transition-all ${
                tab === t.key
                  ? "bg-text-primary text-white shadow-sm"
                  : "bg-white/60 text-text-secondary border border-white/80"
              }`}
              style={{
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
              }}
            >
              {t.label} {count > 0 && <span className="opacity-60">({count})</span>}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[30vh]">
          <div className="animate-pulse text-text-secondary text-sm">Loading...</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <span className="material-symbols-outlined text-4xl text-text-tertiary mb-2 block">task_alt</span>
          <p className="text-text-secondary text-sm">Nothing pending here</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((task) => (
            <div
              key={task.id}
              className="rounded-2xl px-4 py-3 flex items-start gap-3"
              style={{
                background: "var(--glass-bg)",
                backdropFilter: "blur(24px) saturate(180%)",
                WebkitBackdropFilter: "blur(24px) saturate(180%)",
                border: "1px solid var(--glass-border)",
              }}
            >
              {/* Urgency dot or type icon */}
              <div className="mt-1 flex-shrink-0">
                {task.urgency ? (
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{
                      background: urgencyDot[task.urgency] || urgencyDot.info,
                      boxShadow: `0 0 8px ${urgencyDot[task.urgency] || urgencyDot.info}`,
                    }}
                  />
                ) : (
                  <span className="material-symbols-outlined text-base text-text-tertiary">
                    {task.type === "step" ? "school" : task.type === "payment" ? "payments" : "task"}
                  </span>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">{task.title}</p>
                {task.subtitle && (
                  <p className="text-xs text-text-tertiary truncate mt-0.5">{task.subtitle}</p>
                )}
              </div>

              {/* Time */}
              {task.due && (
                <span className="text-[11px] text-text-tertiary whitespace-nowrap flex-shrink-0 mt-0.5">
                  {timeAgo(task.due)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
