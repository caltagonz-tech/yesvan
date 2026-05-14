"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { timeAgo } from "@/lib/timeago";

type QuickCapture = {
  id: string;
  raw_text: string;
  needs_review: boolean;
  created_at: string;
  resolved_to_card_id: string | null;
  action_cards: { id: string; title: string; urgency: string; status: string } | null;
  users: { first_name: string; last_name: string } | null;
};

const URGENCY_STYLE: Record<string, string> = {
  urgent: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-blue-100 text-blue-700",
  info: "bg-gray-100 text-gray-500",
};

const STATUS_STYLE: Record<string, string> = {
  active: "bg-purple-100 text-purple-700",
  completed: "bg-green-100 text-green-700",
  dismissed: "bg-gray-100 text-gray-400",
  snoozed: "bg-amber-100 text-amber-700",
};

export default function CapturesPage() {
  const [captures, setCaptures] = useState<QuickCapture[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "needs_review" | "resolved">("all");
  const supabase = createClient();

  const fetchCaptures = useCallback(async () => {
    const { data } = await supabase
      .from("quick_captures")
      .select("*, action_cards(id, title, urgency, status), users(first_name, last_name)")
      .order("created_at", { ascending: false });
    if (data) setCaptures(data as unknown as QuickCapture[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchCaptures(); }, [fetchCaptures]);

  async function markReviewed(captureId: string) {
    await supabase.from("quick_captures").update({ needs_review: false }).eq("id", captureId);
    fetchCaptures();
  }

  const filtered = captures.filter(c => {
    if (filter === "needs_review") return c.needs_review;
    if (filter === "resolved") return !c.needs_review;
    return true;
  });

  const needsReviewCount = captures.filter(c => c.needs_review).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-pulse text-text-secondary text-sm">Loading captures...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading font-bold text-xl text-text-primary">Quick Captures</h1>
          <p className="text-xs text-text-tertiary mt-0.5">
            Notes typed via the mobile + button — the AI classifies each one into an action card
          </p>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-0.5">
          {(["all", "needs_review", "resolved"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f ? "bg-white text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {f === "all" ? `All (${captures.length})` :
               f === "needs_review" ? `Needs review${needsReviewCount > 0 ? ` (${needsReviewCount})` : ""}` :
               "Reviewed"}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
          <span className="material-symbols-outlined text-[40px] text-text-tertiary block mb-2">inbox</span>
          <p className="text-text-tertiary text-sm">
            {filter === "needs_review" ? "Nothing left to review." : "No captures yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(capture => (
            <div
              key={capture.id}
              className={`rounded-2xl border bg-white p-4 transition-colors ${
                capture.needs_review ? "border-amber-200" : "border-gray-200"
              }`}
            >
              <div className="flex items-start gap-4">
                {/* Left: raw note */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary leading-relaxed">{capture.raw_text}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="text-[11px] text-text-tertiary">
                      {capture.users
                        ? `${capture.users.first_name} ${capture.users.last_name}`
                        : "Unknown"}
                      {" · "}
                      {timeAgo(capture.created_at)}
                    </span>
                    {capture.needs_review && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                        Needs review
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: resolved card + actions */}
                <div className="flex-shrink-0 text-right space-y-2">
                  {capture.action_cards ? (
                    <div>
                      <p className="text-[10px] text-text-tertiary font-semibold uppercase tracking-wide mb-1">
                        AI created
                      </p>
                      <p className="text-xs text-text-primary font-medium max-w-[220px] text-right leading-snug">
                        {capture.action_cards.title}
                      </p>
                      <div className="flex items-center gap-1.5 justify-end mt-1.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${URGENCY_STYLE[capture.action_cards.urgency] || "bg-gray-100 text-gray-500"}`}>
                          {capture.action_cards.urgency}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[capture.action_cards.status] || "bg-gray-100 text-gray-500"}`}>
                          {capture.action_cards.status}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-right">
                      <span className="text-[11px] text-text-tertiary italic">No card created</span>
                    </div>
                  )}

                  {capture.needs_review && (
                    <button
                      onClick={() => markReviewed(capture.id)}
                      className="text-xs px-3 py-1 rounded-lg border border-gray-200 text-text-secondary hover:bg-gray-50 font-medium w-full"
                    >
                      Mark reviewed
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
