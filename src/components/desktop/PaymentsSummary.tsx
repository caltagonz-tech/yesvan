"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

type PaymentRow = {
  amount: number;
  status: string;
  due_date: string | null;
  paid_date: string | null;
  direction: string;
  category: string;
  description: string;
};

type Receivable = {
  display_id: string;
  name: string;
  amount: number;
  due_date: string;
};

type SummaryData = {
  totalDue: number;
  totalPaid: number;
  totalOverdue: number;
  overdueCount: number;
  upcomingWeek: number;
  upcomingWeekCount: number;
  paidThisMonth: number;
  byCategory: { category: string; due: number; paid: number }[];
  receivables: Receivable[];
};

export default function PaymentsSummary() {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: payments } = await supabase
        .from("payments")
        .select("amount, status, due_date, paid_date, direction, category, description");

      if (!payments) { setLoading(false); return; }

      const now = new Date();
      const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      let totalDue = 0;
      let totalPaid = 0;
      let totalOverdue = 0;
      let overdueCount = 0;
      let upcomingWeek = 0;
      let upcomingWeekCount = 0;
      let paidThisMonth = 0;
      const categoryMap: Record<string, { due: number; paid: number }> = {};

      payments.forEach((p: PaymentRow) => {
        const amt = Number(p.amount) || 0;
        const cat = p.category || "Other";

        if (!categoryMap[cat]) categoryMap[cat] = { due: 0, paid: 0 };

        if (p.status === "pending") {
          totalDue += amt;
          categoryMap[cat].due += amt;

          if (p.due_date && new Date(p.due_date) < now) {
            totalOverdue += amt;
            overdueCount++;
          }
          if (p.due_date && new Date(p.due_date) <= weekFromNow && new Date(p.due_date) >= now) {
            upcomingWeek += amt;
            upcomingWeekCount++;
          }
        } else if (p.status === "paid" || p.status === "completed") {
          totalPaid += amt;
          categoryMap[cat].paid += amt;

          if (p.paid_date && new Date(p.paid_date) >= monthStart) {
            paidThisMonth += amt;
          }
        }
      });

      const byCategory = Object.entries(categoryMap)
        .map(([category, vals]) => ({ category, ...vals }))
        .sort((a, b) => (b.due + b.paid) - (a.due + a.paid));

      // §8.5 — Outstanding receivables: students with pending incoming payments
      const { data: receivablePayments } = await supabase
        .from("payments")
        .select("display_id, description, amount, due_date, direction, students(display_id, first_name, last_name)")
        .eq("status", "pending")
        .eq("direction", "incoming")
        .order("due_date")
        .limit(10);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const receivables: Receivable[] = (receivablePayments || []).map((p: any) => {
        const student = Array.isArray(p.students) ? p.students[0] : p.students;
        return {
          display_id: p.display_id || "",
          name: student ? `${student.first_name} ${student.last_name}`.trim() : (p.description || "Unknown"),
          amount: Number(p.amount) || 0,
          due_date: p.due_date || "",
        };
      });

      setData({ totalDue, totalPaid, totalOverdue, overdueCount, upcomingWeek, upcomingWeekCount, paidThisMonth, byCategory, receivables });
      setLoading(false);
    }
    load();
  }, [supabase]);

  if (loading || !data) return null;

  const fmt = (n: number) => `$${n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="mb-6">
      {/* Summary cards row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {/* What has to be paid */}
        <div className="rounded-2xl p-4 bg-white border border-gray-100 shadow-sm">
          <p className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide mb-1">To be paid</p>
          <p className="text-xl font-bold text-text-primary">{fmt(data.totalDue)}</p>
          {data.overdueCount > 0 && (
            <p className="text-xs text-red-500 font-medium mt-1">
              {fmt(data.totalOverdue)} overdue ({data.overdueCount})
            </p>
          )}
        </div>

        {/* What has been paid */}
        <div className="rounded-2xl p-4 bg-white border border-gray-100 shadow-sm">
          <p className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide mb-1">Total paid</p>
          <p className="text-xl font-bold text-green-600">{fmt(data.totalPaid)}</p>
          {data.paidThisMonth > 0 && (
            <p className="text-xs text-text-tertiary mt-1">
              {fmt(data.paidThisMonth)} this month
            </p>
          )}
        </div>

        {/* Due this week */}
        <div className="rounded-2xl p-4 bg-white border border-gray-100 shadow-sm">
          <p className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide mb-1">Due this week</p>
          <p className="text-xl font-bold text-amber-600">{fmt(data.upcomingWeek)}</p>
          <p className="text-xs text-text-tertiary mt-1">{data.upcomingWeekCount} payment{data.upcomingWeekCount !== 1 ? "s" : ""}</p>
        </div>

        {/* Overdue */}
        <div className={`rounded-2xl p-4 border shadow-sm ${data.overdueCount > 0 ? "bg-red-50 border-red-100" : "bg-white border-gray-100"}`}>
          <p className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide mb-1">Overdue</p>
          <p className={`text-xl font-bold ${data.overdueCount > 0 ? "text-red-600" : "text-text-primary"}`}>
            {data.overdueCount > 0 ? fmt(data.totalOverdue) : "None"}
          </p>
          {data.overdueCount > 0 && (
            <p className="text-xs text-red-500 font-medium mt-1">{data.overdueCount} payment{data.overdueCount !== 1 ? "s" : ""}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Category breakdown */}
        {data.byCategory.length > 0 && (
          <div className="rounded-2xl p-4 bg-white border border-gray-100 shadow-sm">
            <p className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide mb-3">By category</p>
            <div className="space-y-2">
              {data.byCategory.slice(0, 6).map((cat) => {
                const total = cat.due + cat.paid;
                const paidPct = total > 0 ? (cat.paid / total) * 100 : 0;
                return (
                  <div key={cat.category} className="flex items-center gap-3">
                    <span className="text-xs text-text-secondary font-medium w-28 truncate">{cat.category}</span>
                    <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-green-400 transition-all"
                        style={{ width: `${paidPct}%` }}
                      />
                    </div>
                    <span className="text-xs text-text-tertiary w-24 text-right">
                      {fmt(cat.paid)} / {fmt(cat.due + cat.paid)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* §8.5 — Outstanding receivables */}
        {data.receivables.length > 0 && (
          <div className="rounded-2xl p-4 bg-white border border-gray-100 shadow-sm">
            <p className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide mb-3">Outstanding receivables</p>
            <div className="space-y-2">
              {data.receivables.map((r, i) => {
                const isOverdue = r.due_date && new Date(r.due_date) < new Date();
                return (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isOverdue ? "bg-red-400" : "bg-amber-400"}`} />
                      <span className="text-xs text-text-primary font-medium truncate">{r.name}</span>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <span className="text-xs font-semibold text-text-primary">{fmt(r.amount)}</span>
                      {r.due_date && (
                        <span className={`text-[10px] ml-2 ${isOverdue ? "text-red-500" : "text-text-tertiary"}`}>
                          {isOverdue ? "overdue" : `due ${r.due_date}`}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
