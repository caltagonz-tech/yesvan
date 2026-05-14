"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { timeAgo } from "@/lib/timeago";

type QuarterlyGoal = {
  id: string;
  quarter: string;
  category: "revenue" | "commissions" | "placements";
  target: number;
  actual: number;
};

type RecentCard = {
  id: string;
  title: string;
  urgency: string;
  status: string;
  created_at: string;
};

type UpcomingHomestay = {
  id: string;
  arrival_date: string;
  departure_date: string | null;
  status: string | null;
  students: { display_id: string; first_name: string; last_name: string } | null;
  host_families: { family_name: string } | null;
};

type UpcomingTransport = {
  id: string;
  type: string | null;
  datetime: string | null;
  flight_number: string | null;
  status: string | null;
  students: { display_id: string; first_name: string } | null;
};

const BAR_COLORS = [
  { bg: "bg-violet-300", border: "border-violet-400", text: "text-violet-900" },
  { bg: "bg-sky-300", border: "border-sky-400", text: "text-sky-900" },
  { bg: "bg-emerald-300", border: "border-emerald-400", text: "text-emerald-900" },
  { bg: "bg-amber-300", border: "border-amber-400", text: "text-amber-900" },
  { bg: "bg-rose-300", border: "border-rose-400", text: "text-rose-900" },
  { bg: "bg-teal-300", border: "border-teal-400", text: "text-teal-900" },
  { bg: "bg-indigo-300", border: "border-indigo-400", text: "text-indigo-900" },
  { bg: "bg-orange-300", border: "border-orange-400", text: "text-orange-900" },
];

const PROCESS_LABELS: Record<string, string> = {
  academic_placement: "Academic Placement",
  homestay_intake: "Homestay Intake",
  custodianship: "Custodianship",
  airport_arrival: "Airport Arrival",
  airport_departure: "Airport Departure",
};

const CATEGORY_CONFIG = {
  revenue: { label: "Revenue", color: "bg-accent", icon: "attach_money" },
  commissions: { label: "Commissions", color: "bg-emerald-500", icon: "monetization_on" },
  placements: { label: "Placements", color: "bg-blue-500", icon: "school" },
};

function getCurrentQuarter(): string {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `${now.getFullYear()}-Q${q}`;
}

export default function DashboardPage() {
  const [studentCount, setStudentCount] = useState<number | null>(null);
  const [activeCards, setActiveCards] = useState<number | null>(null);
  const [pendingPayments, setPendingPayments] = useState<number | null>(null);
  const [commissionPending, setCommissionPending] = useState<number | null>(null);
  const [goals, setGoals] = useState<QuarterlyGoal[]>([]);
  const [editingGoal, setEditingGoal] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [recentCards, setRecentCards] = useState<RecentCard[]>([]);
  const [processStats, setProcessStats] = useState<{ total: number; completed: number }>({ total: 0, completed: 0 });
  const [blockedStudents, setBlockedStudents] = useState<{ id: string; displayId: string; name: string; processName: string; blockedOn: string; step: string }[]>([]);
  const [upcomingHomestays, setUpcomingHomestays] = useState<UpcomingHomestay[]>([]);
  const [upcomingTransports, setUpcomingTransports] = useState<UpcomingTransport[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();
  const currentQuarter = getCurrentQuarter();

  const fetchDashboard = useCallback(async () => {
    const [studentsRes, cardsRes, paymentsRes, goalsRes, recentRes, processRes, commRes] = await Promise.all([
      supabase.from("students").select("id", { count: "exact", head: true }).eq("archived", false),
      supabase.from("action_cards").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("payments").select("amount").eq("status", "pending"),
      supabase.from("quarterly_goals").select("*").eq("quarter", currentQuarter),
      supabase.from("action_cards").select("id, title, urgency, status, created_at").order("created_at", { ascending: false }).limit(5),
      supabase.from("student_process_state").select("id, status"),
      supabase.from("students").select("commission_pending").not("commission_pending", "is", null),
    ]);

    setStudentCount(studentsRes.count ?? 0);
    setActiveCards(cardsRes.count ?? 0);

    if (paymentsRes.data) {
      const total = paymentsRes.data.reduce((sum: number, p: { amount: number }) => sum + (p.amount || 0), 0);
      setPendingPayments(total);
    }

    if (commRes.data) {
      const total = commRes.data.reduce((sum: number, s: { commission_pending: number }) => sum + (s.commission_pending || 0), 0);
      setCommissionPending(total);
    }

    if (goalsRes.data) setGoals(goalsRes.data);
    if (recentRes.data) setRecentCards(recentRes.data);

    if (processRes.data) {
      setProcessStats({
        total: processRes.data.length,
        completed: processRes.data.filter((p: { status: string }) => p.status === "completed").length,
      });
    }

    // Fetch blocked/in-progress processes with student info
    const { data: blockedData } = await supabase
      .from("student_process_state")
      .select("id, process_name, current_step_order, blocked_on, status, students(display_id, first_name, last_name)")
      .not("blocked_on", "is", null)
      .eq("status", "in_progress")
      .limit(5);

    if (blockedData) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setBlockedStudents(blockedData.map((b: any) => ({
        id: b.id,
        displayId: b.students?.display_id || "?",
        name: `${b.students?.first_name || ""} ${b.students?.last_name || ""}`.trim(),
        processName: PROCESS_LABELS[b.process_name] || b.process_name,
        blockedOn: b.blocked_on || "",
        step: `Step ${b.current_step_order}`,
      })));
    }

    // Upcoming events — next 14 days
    const todayStr = new Date().toISOString().slice(0, 10);
    const endDate = new Date(Date.now() + 14 * 86400000);
    const endStr = endDate.toISOString().slice(0, 10);

    const [upHomestayRes, upTransportRes] = await Promise.all([
      supabase
        .from("homestays")
        .select("id, arrival_date, departure_date, status, students(display_id, first_name, last_name), host_families(family_name)")
        .lte("arrival_date", endStr)
        .or(`departure_date.gte.${todayStr},departure_date.is.null`)
        .neq("status", "cancelled"),
      supabase
        .from("transports")
        .select("id, type, datetime, flight_number, status, students(display_id, first_name)")
        .gte("datetime", `${todayStr}T00:00:00`)
        .lte("datetime", `${endStr}T23:59:59`)
        .neq("status", "cancelled"),
    ]);

    if (upHomestayRes.data) setUpcomingHomestays(upHomestayRes.data as unknown as UpcomingHomestay[]);
    if (upTransportRes.data) setUpcomingTransports(upTransportRes.data as unknown as UpcomingTransport[]);

    setLoading(false);
  }, [supabase, currentQuarter]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  // §8.5 — Editable quarterly goal targets inline
  async function saveGoalTarget(goalId: string, newTarget: number) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("quarterly_goals").update({ target: newTarget, updated_by: user.id }).eq("id", goalId);
    setGoals((prev) => prev.map((g) => g.id === goalId ? { ...g, target: newTarget } : g));
    setEditingGoal(null);
  }

  function formatCurrency(val: number | null): string {
    if (val === null) return "—";
    return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(val);
  }

  const urgencyColor: Record<string, string> = {
    urgent: "bg-red-500",
    medium: "bg-amber-500",
    low: "bg-blue-400",
    info: "bg-gray-400",
  };

  const DAYS = 14;
  const timelineDays = useMemo(() => {
    const days: Date[] = [];
    for (let i = 0; i < DAYS; i++) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }, []);

  const todayMidnight = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const windowEnd = useMemo(() => { const d = new Date(todayMidnight); d.setDate(d.getDate() + DAYS - 1); return d; }, [todayMidnight]);

  const timelineRows = useMemo(() => {
    return upcomingHomestays
      .filter((h) => {
        // Only show homestay rows where arrival OR departure falls within the 14-day window
        const arrival = new Date(h.arrival_date + "T00:00:00");
        const departure = h.departure_date ? new Date(h.departure_date + "T00:00:00") : null;
        const arrivalInWindow = arrival >= todayMidnight && arrival <= windowEnd;
        const departureInWindow = departure !== null && departure >= todayMidnight && departure <= windowEnd;
        return arrivalInWindow || departureInWindow;
      })
      .map((h, i) => {
        const arrival = new Date(h.arrival_date + "T00:00:00");
        const departure = h.departure_date ? new Date(h.departure_date + "T00:00:00") : windowEnd;
        const clampedStart = arrival < todayMidnight ? todayMidnight : arrival;
        const clampedEnd = departure > windowEnd ? windowEnd : departure;
        const startCol = Math.round((clampedStart.getTime() - todayMidnight.getTime()) / 86400000);
        const spanCols = Math.max(Math.round((clampedEnd.getTime() - clampedStart.getTime()) / 86400000) + 1, 1);
        const studentId = h.students?.display_id || "";
        const rowTransports = upcomingTransports
          .filter((t) => {
            if (!t.datetime || t.students?.display_id !== studentId) return false;
            const td = new Date(t.datetime);
            const day = Math.round((new Date(td.getFullYear(), td.getMonth(), td.getDate()).getTime() - todayMidnight.getTime()) / 86400000);
            return day >= 0 && day < DAYS;
          })
          .map((t) => {
            const td = new Date(t.datetime!);
            const col = Math.round((new Date(td.getFullYear(), td.getMonth(), td.getDate()).getTime() - todayMidnight.getTime()) / 86400000);
            return { col, transport: t };
          });
        return { h, i, startCol, spanCols, rowTransports };
      });
  }, [upcomingHomestays, upcomingTransports, todayMidnight, windowEnd]);

  // transports not linked to any homestay row that has a start/end in the window
  const orphanTransports = useMemo(() => {
    const linkedIds = new Set(timelineRows.map(({ h }) => h.students?.display_id));
    return upcomingTransports.filter((t) => !linkedIds.has(t.students?.display_id || ""));
  }, [timelineRows, upcomingTransports]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-pulse text-text-secondary text-sm">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-heading font-bold text-xl text-text-primary mb-6">Dashboard</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-[20px] text-accent">school</span>
            <p className="text-sm text-text-secondary font-medium">Active students</p>
          </div>
          <p className="text-2xl font-bold text-text-primary">{studentCount ?? "—"}</p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-[20px] text-amber-500">task_alt</span>
            <p className="text-sm text-text-secondary font-medium">Pending tasks</p>
          </div>
          <p className="text-2xl font-bold text-text-primary">{activeCards ?? "—"}</p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-[20px] text-emerald-500">payments</span>
            <p className="text-sm text-text-secondary font-medium">Pending payments</p>
          </div>
          <p className="text-2xl font-bold text-text-primary">{formatCurrency(pendingPayments)}</p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-[20px] text-purple-500">account_balance_wallet</span>
            <p className="text-sm text-text-secondary font-medium">Commissions due</p>
          </div>
          <p className="text-2xl font-bold text-text-primary">{formatCurrency(commissionPending)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quarterly goals */}
        <div className="lg:col-span-2 rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading font-semibold text-sm text-text-primary">
              Quarterly Goals — {currentQuarter}
            </h2>
          </div>

          {goals.length === 0 ? (
            <div className="text-center py-6">
              <span className="material-symbols-outlined text-[32px] text-text-tertiary mb-2">flag</span>
              <p className="text-sm text-text-tertiary">No goals set for this quarter.</p>
              <p className="text-xs text-text-tertiary mt-1">
                Add goals in the quarterly_goals table to track progress here.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* §8.5 — Bar chart: target vs. actual per category */}
              <div className="flex items-end gap-4 justify-center mb-2">
                {goals.map((goal) => {
                  const config = CATEGORY_CONFIG[goal.category];
                  const maxVal = Math.max(goal.target, goal.actual, 1);
                  const targetH = Math.round((goal.target / maxVal) * 80);
                  const actualH = Math.round((goal.actual / maxVal) * 80);
                  return (
                    <div key={goal.id} className="flex flex-col items-center">
                      <div className="flex items-end gap-1" style={{ height: 90 }}>
                        <div
                          className="w-6 rounded-t bg-gray-200"
                          style={{ height: targetH }}
                          title={`Target: ${goal.target}`}
                        />
                        <div
                          className={`w-6 rounded-t ${config.color}`}
                          style={{ height: actualH }}
                          title={`Actual: ${goal.actual}`}
                        />
                      </div>
                      <span className="text-[10px] text-text-tertiary mt-1.5">{config.label}</span>
                    </div>
                  );
                })}
                <div className="flex items-center gap-3 ml-4 text-[10px] text-text-tertiary self-start pt-1">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-200 inline-block" /> Target</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-accent inline-block" /> Actual</span>
                </div>
              </div>

              {goals.map((goal) => {
                const config = CATEGORY_CONFIG[goal.category];
                const pct = goal.target > 0 ? Math.min(Math.round((goal.actual / goal.target) * 100), 100) : 0;
                const isOver = goal.actual > goal.target;

                return (
                  <div key={goal.id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[16px] text-text-secondary">{config.icon}</span>
                        <span className="text-sm font-medium text-text-primary">{config.label}</span>
                      </div>
                      <div className="text-right flex items-center gap-1">
                        <span className="text-sm font-semibold text-text-primary">
                          {goal.category === "placements" ? goal.actual : formatCurrency(goal.actual)}
                        </span>
                        <span className="text-xs text-text-tertiary">/</span>
                        {editingGoal === goal.id ? (
                          <input
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => {
                              const num = parseFloat(editValue);
                              if (!isNaN(num) && num > 0) saveGoalTarget(goal.id, num);
                              else setEditingGoal(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                const num = parseFloat(editValue);
                                if (!isNaN(num) && num > 0) saveGoalTarget(goal.id, num);
                                else setEditingGoal(null);
                              }
                              if (e.key === "Escape") setEditingGoal(null);
                            }}
                            className="w-24 text-xs text-right px-1.5 py-0.5 rounded-lg border border-accent/30 bg-white focus:outline-none focus:ring-2 focus:ring-accent/30"
                          />
                        ) : (
                          <button
                            onClick={() => { setEditingGoal(goal.id); setEditValue(String(goal.target)); }}
                            className="text-xs text-text-tertiary hover:text-accent hover:underline cursor-pointer transition-colors"
                            title="Click to edit target"
                          >
                            {goal.category === "placements" ? goal.target : formatCurrency(goal.target)}
                          </button>
                        )}
                        {isOver && (
                          <span className="text-[10px] ml-1 px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                            Exceeded
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="w-full h-2.5 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${config.color}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-text-tertiary mt-1 text-right">{pct}%</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Process progress */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="font-heading font-semibold text-sm text-text-primary mb-3">Process Progress</h2>
            <div className="flex items-center gap-4">
              <div className="relative w-16 h-16">
                <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                  <circle cx="18" cy="18" r="14" fill="none" stroke="#f3f4f6" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="14" fill="none"
                    stroke="#8b5cf6"
                    strokeWidth="3"
                    strokeDasharray={`${processStats.total > 0 ? (processStats.completed / processStats.total) * 88 : 0} 88`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-bold text-text-primary">
                    {processStats.total > 0 ? Math.round((processStats.completed / processStats.total) * 100) : 0}%
                  </span>
                </div>
              </div>
              <div>
                <p className="text-sm text-text-primary font-medium">{processStats.completed} / {processStats.total}</p>
                <p className="text-xs text-text-tertiary">processes completed</p>
              </div>
            </div>
          </div>

          {/* Blocked students — process awareness */}
          {blockedStudents.length > 0 && (
            <div className="rounded-2xl border border-red-100 bg-red-50/50 p-5">
              <h2 className="font-heading font-semibold text-sm text-text-primary mb-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-red-500">warning</span>
                Blocked
              </h2>
              <div className="space-y-2.5">
                {blockedStudents.map((s) => (
                  <div key={s.id} className="flex items-start gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-text-primary font-medium">{s.displayId} {s.name}</p>
                      <p className="text-[11px] text-text-tertiary">
                        {s.processName} · {s.step} — <span className="text-red-500">{s.blockedOn}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent cards */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="font-heading font-semibold text-sm text-text-primary mb-3">Recent Cards</h2>
            {recentCards.length === 0 ? (
              <p className="text-xs text-text-tertiary py-2">No action cards yet.</p>
            ) : (
              <div className="space-y-2">
                {recentCards.map((card) => (
                  <div key={card.id} className="flex items-start gap-2.5">
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${urgencyColor[card.urgency] || "bg-gray-400"}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-text-primary truncate">{card.title}</p>
                      <p className="text-[11px] text-text-tertiary">
                        {card.status} · {timeAgo(card.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Upcoming events timeline */}
      <div className="mt-8">
        <h2 className="font-heading font-semibold text-sm text-text-primary mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px] text-text-secondary">calendar_month</span>
          Upcoming — next 14 days
        </h2>

        {timelineRows.length === 0 && orphanTransports.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
            <span className="material-symbols-outlined text-[32px] text-text-tertiary">event_available</span>
            <p className="text-sm text-text-tertiary mt-2">No homestays or transports in the next 14 days.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
            <div className="flex">
              {/* Left label column */}
              <div className="flex-shrink-0 border-r border-gray-200 bg-gray-50/50 z-10 min-w-[140px]">
                <div className="h-[44px] border-b border-gray-200 px-3 flex items-center">
                  <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wide">Student</span>
                </div>
                {timelineRows.map(({ h, i }) => (
                  <div key={h.id} className="h-[40px] border-b border-gray-100 px-3 flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-sm flex-shrink-0 ${BAR_COLORS[i % BAR_COLORS.length].bg}`} />
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold text-text-primary leading-tight truncate">
                        {h.students?.display_id} {h.students?.first_name}
                      </p>
                      <p className="text-[9px] text-text-tertiary leading-tight truncate">
                        {h.host_families?.family_name || "No host"}
                      </p>
                    </div>
                  </div>
                ))}
                {orphanTransports.map((t) => (
                  <div key={t.id} className="h-[40px] border-b border-gray-100 px-3 flex items-center gap-2">
                    <span className={`material-symbols-outlined text-[12px] ${t.type === "arrival" ? "text-green-600" : "text-red-500"}`}>
                      {t.type === "arrival" ? "flight_land" : "flight_takeoff"}
                    </span>
                    <p className="text-[11px] font-semibold text-text-primary truncate">
                      {t.students?.display_id} {t.students?.first_name}
                    </p>
                  </div>
                ))}
              </div>

              {/* Scrollable grid */}
              <div className="flex-1 overflow-x-auto">
                {(() => {
                  const COL = 38;
                  const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
                  return (
                    <div style={{ minWidth: DAYS * COL }}>
                      {/* Day headers */}
                      <div className="flex border-b border-gray-200">
                        {timelineDays.map((d, i) => {
                          const isToday = i === 0;
                          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                          return (
                            <div
                              key={i}
                              className={`flex-shrink-0 text-center border-r border-gray-100 py-1 ${isToday ? "bg-accent/10" : isWeekend ? "bg-gray-50/60" : ""}`}
                              style={{ width: COL }}
                            >
                              <div className="text-[9px] text-text-tertiary font-medium">{WEEKDAYS[d.getDay()]}</div>
                              <div className={`text-[11px] font-medium ${isToday ? "w-5 h-5 rounded-full bg-accent text-white flex items-center justify-center mx-auto" : "text-text-secondary"}`}>
                                {d.getDate()}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Homestay rows */}
                      {timelineRows.map(({ h, i, startCol, spanCols, rowTransports }) => {
                        const colors = BAR_COLORS[i % BAR_COLORS.length];
                        return (
                          <div key={h.id} className="relative h-[40px] border-b border-gray-100">
                            {/* Column backgrounds */}
                            <div className="absolute inset-0 flex pointer-events-none">
                              {timelineDays.map((d, ci) => (
                                <div
                                  key={ci}
                                  className={`flex-shrink-0 border-r border-gray-50 ${ci === 0 ? "bg-accent/5" : d.getDay() === 0 || d.getDay() === 6 ? "bg-gray-50/30" : ""}`}
                                  style={{ width: COL }}
                                />
                              ))}
                            </div>
                            {/* Today line */}
                            <div className="absolute top-0 bottom-0 w-px bg-accent/30 z-10 pointer-events-none" style={{ left: COL / 2 }} />
                            {/* Homestay bar */}
                            <div
                              className={`absolute top-1.5 h-6 rounded-md border ${colors.bg} ${colors.border} ${colors.text} flex items-center px-1.5 text-[9px] font-semibold z-20 cursor-default`}
                              style={{ left: startCol * COL + 2, width: spanCols * COL - 4 }}
                              title={`${h.students?.display_id} @ ${h.host_families?.family_name || "TBD"} · ${h.arrival_date} → ${h.departure_date || "ongoing"}`}
                            >
                              <span className="truncate">{h.host_families?.family_name || "TBD"}</span>
                              <span className={`ml-auto text-[8px] opacity-60 flex-shrink-0 px-1 py-0.5 rounded ${h.status === "active" ? "bg-white/40" : "bg-white/20"}`}>
                                {h.status}
                              </span>
                            </div>
                            {/* Transport icons */}
                            {rowTransports.map(({ col, transport }) => (
                              <div
                                key={transport.id}
                                className="absolute z-30 pointer-events-none"
                                style={{ left: col * COL + COL / 2 - 7, top: transport.type === "arrival" ? 0 : 26 }}
                                title={`${transport.type === "arrival" ? "Arrival" : "Departure"} · ${transport.flight_number || ""} · ${transport.datetime ? new Date(transport.datetime).toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" }) : ""}`}
                              >
                                <span className={`material-symbols-outlined text-[13px] ${transport.type === "arrival" ? "text-green-600" : "text-red-500"}`}>
                                  {transport.type === "arrival" ? "flight_land" : "flight_takeoff"}
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      })}

                      {/* Orphan transports (no homestay) */}
                      {orphanTransports.map((t) => {
                        if (!t.datetime) return null;
                        const td = new Date(t.datetime);
                        const col = Math.round((new Date(td.getFullYear(), td.getMonth(), td.getDate()).getTime() - todayMidnight.getTime()) / 86400000);
                        if (col < 0 || col >= DAYS) return null;
                        return (
                          <div key={t.id} className="relative h-[40px] border-b border-gray-100">
                            <div className="absolute inset-0 flex pointer-events-none">
                              {timelineDays.map((d, ci) => (
                                <div key={ci} className={`flex-shrink-0 border-r border-gray-50 ${ci === 0 ? "bg-accent/5" : d.getDay() === 0 || d.getDay() === 6 ? "bg-gray-50/30" : ""}`} style={{ width: COL }} />
                              ))}
                            </div>
                            <div className="absolute top-0 bottom-0 w-px bg-accent/30 z-10 pointer-events-none" style={{ left: COL / 2 }} />
                            <div
                              className="absolute z-30 flex items-center gap-1"
                              style={{ left: col * COL + 2, top: 10 }}
                              title={`${t.type === "arrival" ? "Arrival" : "Departure"} · ${t.flight_number || ""} · ${t.datetime ? new Date(t.datetime).toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" }) : ""}`}
                            >
                              <span className={`material-symbols-outlined text-[13px] ${t.type === "arrival" ? "text-green-600" : "text-red-500"}`}>
                                {t.type === "arrival" ? "flight_land" : "flight_takeoff"}
                              </span>
                              <span className="text-[9px] text-text-secondary font-medium">{t.flight_number || ""}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Legend */}
            <div className="border-t border-gray-200 px-4 py-2 flex items-center gap-4 bg-gray-50/30">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[13px] text-green-600">flight_land</span>
                <span className="text-[10px] text-text-tertiary">Arrival</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[13px] text-red-500">flight_takeoff</span>
                <span className="text-[10px] text-text-tertiary">Departure</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-px h-3 bg-accent/40" />
                <span className="text-[10px] text-text-tertiary">Today</span>
              </div>
              <span className="ml-auto text-[10px] text-text-tertiary">
                {timelineRows.length} homestay{timelineRows.length !== 1 ? "s" : ""} · {upcomingTransports.length} transport{upcomingTransports.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
