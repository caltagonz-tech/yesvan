"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { timeAgo } from "@/lib/timeago";

type MonthlyPayment = {
  id: string;
  month: string;
  base_amount: number;
  adjustment_amount: number;
  adjustment_reason: string | null;
  final_amount: number;
  status: string;
  paid_date: string | null;
};

type Homestay = {
  id: string;
  student_id: string;
  arrival_date: string;
  departure_date: string | null;
  status: string;
  homestay_fee: number | null;
  total: number | null;
  total_paid: number | null;
  student?: { display_id: string; first_name: string; last_name: string };
};

export default function HostPaymentDetail({ hostId, onClose }: { hostId: string; onClose: () => void }) {
  const [homestays, setHomestays] = useState<Homestay[]>([]);
  const [payments, setPayments] = useState<MonthlyPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingAdjustment, setAddingAdjustment] = useState<string | null>(null);
  const [adjAmount, setAdjAmount] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      // Get homestays for this host
      const { data: hs } = await supabase
        .from("homestays")
        .select("id, student_id, arrival_date, departure_date, status, homestay_fee, total, total_paid, students(display_id, first_name, last_name)")
        .eq("host_id", hostId)
        .order("arrival_date", { ascending: false });

      if (hs) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setHomestays(hs.map((h: any) => ({ ...h, student: h.students })));
      }

      // Get monthly payments for this host
      const { data: pmts } = await supabase
        .from("host_monthly_payments")
        .select("*")
        .eq("host_id", hostId)
        .order("month", { ascending: false });

      if (pmts) setPayments(pmts);
      setLoading(false);
    }
    load();
  }, [supabase, hostId]);

  async function handleSaveAdjustment(paymentId: string) {
    const amt = parseFloat(adjAmount);
    if (isNaN(amt) || !adjReason.trim()) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("host_monthly_payments")
      .update({
        adjustment_amount: amt,
        adjustment_reason: adjReason.trim(),
        updated_by: user.id,
      })
      .eq("id", paymentId);

    // Refresh
    const { data: pmts } = await supabase
      .from("host_monthly_payments")
      .select("*")
      .eq("host_id", hostId)
      .order("month", { ascending: false });
    if (pmts) setPayments(pmts);

    setAddingAdjustment(null);
    setAdjAmount("");
    setAdjReason("");
  }

  async function handleMarkPaid(paymentId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("host_monthly_payments")
      .update({ status: "paid", paid_date: new Date().toISOString().split("T")[0], updated_by: user.id })
      .eq("id", paymentId);

    setPayments((prev) => prev.map((p) => p.id === paymentId ? { ...p, status: "paid", paid_date: new Date().toISOString().split("T")[0] } : p));
  }

  const fmt = (n: number) => `$${Math.abs(n).toLocaleString("en-CA", { minimumFractionDigits: 2 })}`;
  const totalOwed = payments.filter((p) => p.status === "pending").reduce((sum, p) => sum + p.final_amount, 0);
  const totalPaid = payments.filter((p) => p.status === "paid").reduce((sum, p) => sum + p.final_amount, 0);

  return (
    <div className="fixed inset-0 bg-black/20 flex items-start justify-center pt-16 z-50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="font-heading font-bold text-lg text-text-primary">Host Payment Details</h2>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary text-xl">&times;</button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-center py-8 text-text-tertiary text-sm">Loading...</div>
          ) : (
            <>
              {/* Summary */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="rounded-xl p-3 bg-amber-50 border border-amber-100">
                  <p className="text-[10px] font-medium text-text-tertiary uppercase tracking-wide">Pending</p>
                  <p className="text-lg font-bold text-amber-700">{fmt(totalOwed)}</p>
                </div>
                <div className="rounded-xl p-3 bg-green-50 border border-green-100">
                  <p className="text-[10px] font-medium text-text-tertiary uppercase tracking-wide">Paid</p>
                  <p className="text-lg font-bold text-green-700">{fmt(totalPaid)}</p>
                </div>
              </div>

              {/* Homestays */}
              {homestays.length > 0 && (
                <div className="mb-6">
                  <p className="text-xs font-medium text-text-tertiary uppercase tracking-wide mb-2">Active placements</p>
                  <div className="space-y-2">
                    {homestays.map((hs) => (
                      <div key={hs.id} className="flex items-center gap-3 rounded-xl p-3 bg-gray-50 border border-gray-100">
                        <div className={`w-2 h-2 rounded-full ${hs.status === "active" ? "bg-green-400" : "bg-gray-300"}`} />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-text-primary">
                            {hs.student?.display_id} {hs.student?.first_name} {hs.student?.last_name}
                          </p>
                          <p className="text-xs text-text-tertiary">
                            {new Date(hs.arrival_date).toLocaleDateString("en-CA")}
                            {hs.departure_date ? ` — ${new Date(hs.departure_date).toLocaleDateString("en-CA")}` : " — ongoing"}
                          </p>
                        </div>
                        {hs.homestay_fee && (
                          <span className="text-xs font-medium text-text-secondary">{fmt(hs.homestay_fee)}/mo</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Monthly payments table */}
              <p className="text-xs font-medium text-text-tertiary uppercase tracking-wide mb-2">Monthly payments</p>
              {payments.length === 0 ? (
                <p className="text-sm text-text-tertiary text-center py-4">No monthly payments recorded</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 text-xs font-medium text-text-tertiary">Month</th>
                      <th className="text-right py-2 text-xs font-medium text-text-tertiary">Base</th>
                      <th className="text-right py-2 text-xs font-medium text-text-tertiary">Adj.</th>
                      <th className="text-right py-2 text-xs font-medium text-text-tertiary">Total</th>
                      <th className="text-center py-2 text-xs font-medium text-text-tertiary">Status</th>
                      <th className="py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <>
                        <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="py-2 text-text-primary">
                            {new Date(p.month).toLocaleDateString("en-CA", { year: "numeric", month: "short" })}
                          </td>
                          <td className="py-2 text-right text-text-secondary">{fmt(p.base_amount)}</td>
                          <td className="py-2 text-right">
                            {p.adjustment_amount !== 0 ? (
                              <span className={p.adjustment_amount > 0 ? "text-green-600" : "text-red-500"}>
                                {p.adjustment_amount > 0 ? "+" : "-"}{fmt(p.adjustment_amount)}
                              </span>
                            ) : (
                              <span className="text-text-tertiary">—</span>
                            )}
                          </td>
                          <td className="py-2 text-right font-medium text-text-primary">{fmt(p.final_amount)}</td>
                          <td className="py-2 text-center">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                              p.status === "paid" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                            }`}>
                              {p.status}
                            </span>
                          </td>
                          <td className="py-2 text-right">
                            <div className="flex items-center gap-1 justify-end">
                              {p.status === "pending" && (
                                <>
                                  <button
                                    onClick={() => handleMarkPaid(p.id)}
                                    className="text-[11px] text-green-600 font-medium hover:underline"
                                  >
                                    Mark paid
                                  </button>
                                  <button
                                    onClick={() => setAddingAdjustment(addingAdjustment === p.id ? null : p.id)}
                                    className="text-[11px] text-accent font-medium hover:underline ml-2"
                                  >
                                    Adjust
                                  </button>
                                </>
                              )}
                              {p.paid_date && (
                                <span className="text-[10px] text-text-tertiary">{timeAgo(p.paid_date)}</span>
                              )}
                            </div>
                          </td>
                        </tr>
                        {addingAdjustment === p.id && (
                          <tr key={`adj-${p.id}`}>
                            <td colSpan={6} className="py-2 px-1">
                              <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-3">
                                <input
                                  type="number"
                                  value={adjAmount}
                                  onChange={(e) => setAdjAmount(e.target.value)}
                                  placeholder="Amount (+/-)"
                                  className="w-24 text-sm px-2 py-1 rounded-lg border border-gray-200 focus:outline-none"
                                />
                                <input
                                  value={adjReason}
                                  onChange={(e) => setAdjReason(e.target.value)}
                                  placeholder="Reason for adjustment..."
                                  className="flex-1 text-sm px-2 py-1 rounded-lg border border-gray-200 focus:outline-none"
                                />
                                <button
                                  onClick={() => handleSaveAdjustment(p.id)}
                                  className="text-xs font-semibold text-white bg-accent px-3 py-1 rounded-lg"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => { setAddingAdjustment(null); setAdjAmount(""); setAdjReason(""); }}
                                  className="text-xs text-text-tertiary"
                                >
                                  Cancel
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                        {p.adjustment_reason && p.adjustment_amount !== 0 && (
                          <tr key={`reason-${p.id}`}>
                            <td colSpan={6} className="py-0 pb-2 px-1">
                              <p className="text-[11px] text-text-tertiary italic">
                                Adjustment: {p.adjustment_reason}
                              </p>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
