"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { timeAgo } from "@/lib/timeago";
import GreetingBubble from "@/components/mobile/GreetingBubble";
import ActionCard from "@/components/mobile/ActionCard";
import AllClearState from "@/components/mobile/AllClearState";

type CardData = {
  id: string;
  category: string;
  urgency: "urgent" | "medium" | "low" | "info";
  title: string;
  context: string | null;
  attribution?: string;
  status: string;
  created_at?: string;
  draft_email_subject?: string | null;
  draft_email_body?: string | null;
  draft_email_to?: string | null;
  assigned_to?: string | null;
  process_name?: string | null;
  linked_step_order?: number | null;
};

type TeamMember = { id: string; name: string };

const SNOOZE_OPTIONS = [
  { label: "1 hour", ms: 60 * 60 * 1000 },
  { label: "Tomorrow", ms: 24 * 60 * 60 * 1000 },
  { label: "Next week", ms: 7 * 24 * 60 * 60 * 1000 },
];

/**
 * Deduplicate cards by process: if multiple cards belong to the same checklist process
 * (detected by title keywords like "host family", "airport pickup", "accommodation", etc.),
 * keep only the most urgent one per process so the user sees one entry per checklist.
 */
function deduplicateByProcess(cards: CardData[]): CardData[] {
  const processKeywords: Record<string, string[]> = {
    homestay: ["host family", "accommodation", "homestay", "host placement"],
    airport_arrival: ["airport pickup", "airport arrival", "arrive", "pickup"],
    airport_departure: ["airport departure", "departure", "drop-off", "drop off"],
    academic: ["academic placement", "school placement", "university placement", "paperwork to school"],
    custodianship: ["custodianship", "custodian", "guardian"],
  };

  const processCards = new Map<string, CardData>();
  const nonProcessCards: CardData[] = [];

  for (const card of cards) {
    const titleLower = (card.title || "").toLowerCase();
    const contextLower = (card.context || "").toLowerCase();
    const combined = titleLower + " " + contextLower;

    let matchedProcess: string | null = null;
    for (const [process, keywords] of Object.entries(processKeywords)) {
      if (keywords.some((kw) => combined.includes(kw))) {
        matchedProcess = process;
        break;
      }
    }

    if (matchedProcess) {
      // Keep the most urgent card per process (cards are already sorted by urgency)
      if (!processCards.has(matchedProcess)) {
        processCards.set(matchedProcess, { ...card, process_name: matchedProcess });
      }
    } else {
      nonProcessCards.push(card);
    }
  }

  // Merge: process cards first (sorted by urgency), then non-process cards
  const urgencyOrder = { urgent: 0, medium: 1, low: 2, info: 3 };
  const allProcessCards = [...processCards.values()].sort(
    (a, b) => (urgencyOrder[a.urgency] ?? 3) - (urgencyOrder[b.urgency] ?? 3)
  );

  return [...allProcessCards, ...nonProcessCards];
}

export default function MobileHomePage() {
  const router = useRouter();
  const [cards, setCards] = useState<CardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [showSnooze, setShowSnooze] = useState<string | null>(null);
  const [aiGreeting, setAiGreeting] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<string | null>(null);
  const [draftBody, setDraftBody] = useState("");

  // Undo state
  const [undoAction, setUndoAction] = useState<{ cardId: string; previousStatus: string; label: string } | null>(null);
  const undoTimer = useRef<NodeJS.Timeout | null>(null);

  // Hand off state
  const [showHandoff, setShowHandoff] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [handoffNote, setHandoffNote] = useState("");

  // Energy-aware state
  const [energy, setEnergy] = useState<"high" | "medium" | "low">("medium");
  const [breakingDown, setBreakingDown] = useState<string | null>(null);
  const [breakdown, setBreakdown] = useState<{ cardId: string; steps: string[] } | null>(null);
  const [prioritizedIds, setPrioritizedIds] = useState<string[] | null>(null);
  const [prioritizing, setPrioritizing] = useState(false);

  // Hyperfocus protection (§4.15): suppress new card arrivals while user is mid-flow
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);
  const [cardSnapshot, setCardSnapshot] = useState<CardData[] | null>(null);

  const supabase = createClient();

  const fetchCards = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    // Get user profile for greeting
    const { data: profile } = await supabase
      .from("users")
      .select("first_name")
      .eq("id", user.id)
      .single();
    if (profile) setUserName(profile.first_name);

    // Get active cards: assigned to me, or unassigned urgent, or created by me
    const { data: cardData } = await supabase
      .from("action_cards")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (cardData) {
      const now = new Date();
      const filtered = cardData.filter((c: CardData & { snoozed_until: string | null; assigned_to: string | null; source_user_id: string | null }) => {
        if (c.snoozed_until && new Date(c.snoozed_until) > now) return false;
        return c.assigned_to === user.id || c.assigned_to === null || c.source_user_id === user.id;
      });

      // Sort by urgency
      const urgencyOrder = { urgent: 0, medium: 1, low: 2, info: 3 };
      filtered.sort((a: CardData, b: CardData) => (urgencyOrder[a.urgency] ?? 3) - (urgencyOrder[b.urgency] ?? 3));

      // Deduplicate by process: keep one card per process (most urgent), plus all non-process cards
      const deduped = deduplicateByProcess(filtered);

      setCards(deduped);
    }
    setLoading(false);
  }, [supabase]);

  // Initial load — show cards immediately
  useEffect(() => { fetchCards(); }, [fetchCards]);

  // Sync process cards in the background after initial render.
  // Any new/updated cards land via the realtime subscription — no visible flash.
  useEffect(() => {
    fetch("/api/process-assist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sync_process_cards" }),
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch team members for hand off
  useEffect(() => {
    supabase.from("users").select("id, first_name, last_name").then(({ data }) => {
      if (data) {
        setTeamMembers(data.map((u) => ({
          id: u.id,
          name: `${u.first_name || ""} ${u.last_name || ""}`.trim() || "Unknown",
        })));
      }
    });
  }, [supabase]);

  // Re-fetch greeting once cards are loaded so it can reference them
  useEffect(() => {
    if (loading) return;
    fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "greeting",
        data: {
          cards: cards.slice(0, 3).map(c => ({ title: c.title, urgency: c.urgency, category: c.category })),
        },
      }),
    })
      .then((r) => r.json())
      .then((d) => { if (d.greeting) setAiGreeting(d.greeting); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Realtime subscription for cards
  useEffect(() => {
    const channel = supabase
      .channel("cards-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "action_cards" }, () => {
        fetchCards();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, fetchCards]);

  // Cleanup undo timer
  useEffect(() => {
    return () => { if (undoTimer.current) clearTimeout(undoTimer.current); };
  }, []);

  // AI-powered card prioritization based on energy level
  useEffect(() => {
    if (cards.length <= 3) {
      setPrioritizedIds(cards.map((c) => c.id));
      return;
    }

    setPrioritizing(true);
    const controller = new AbortController();

    fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "prioritize_cards",
        data: {
          cards: cards.map((c) => ({
            id: c.id,
            title: c.title,
            urgency: c.urgency,
            context: c.context,
            category: c.category,
          })),
          energy,
        },
      }),
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.selected_ids?.length) {
          setPrioritizedIds(d.selected_ids);
        } else {
          // Fallback: first 3
          setPrioritizedIds(cards.slice(0, 3).map((c) => c.id));
        }
      })
      .catch(() => {
        setPrioritizedIds(cards.slice(0, 3).map((c) => c.id));
      })
      .finally(() => setPrioritizing(false));

    return () => controller.abort();
  }, [cards, energy]);

  // §4.15 — Snapshot cards when entering a focused flow; clear when leaving
  useEffect(() => {
    const nowFocused = !!(showSnooze || showHandoff || editingDraft || breakdown);
    if (nowFocused && !cardSnapshot) {
      setCardSnapshot([...cards]);
    } else if (!nowFocused && cardSnapshot) {
      setCardSnapshot(null);
    }
  }, [showSnooze, showHandoff, editingDraft, breakdown, cards, cardSnapshot]);

  async function handleComplete(cardId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("action_cards")
      .update({ status: "completed", updated_by: user.id })
      .eq("id", cardId);

    // Set up undo
    setUndoAction({ cardId, previousStatus: "active", label: "Task completed" });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndoAction(null), 5000);

    setTimeout(() => fetchCards(), 500);
  }

  async function handleUndo() {
    if (!undoAction) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("action_cards")
      .update({ status: undoAction.previousStatus, updated_by: user.id })
      .eq("id", undoAction.cardId);

    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoAction(null);
    fetchCards();
  }

  async function handleSnooze(cardId: string, durationMs: number) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const snoozedUntil = new Date(Date.now() + durationMs).toISOString();
    await supabase
      .from("action_cards")
      .update({ status: "snoozed", snoozed_until: snoozedUntil, updated_by: user.id })
      .eq("id", cardId);
    setShowSnooze(null);

    // Undo for snooze
    setUndoAction({ cardId, previousStatus: "active", label: "Snoozed" });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndoAction(null), 5000);

    fetchCards();
  }

  async function handleDismiss(cardId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("action_cards")
      .update({ status: "dismissed", updated_by: user.id })
      .eq("id", cardId);

    setUndoAction({ cardId, previousStatus: "active", label: "Dismissed" });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndoAction(null), 5000);

    fetchCards();
  }

  async function handleHandoff(cardId: string, toUserId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const updates: Record<string, unknown> = {
      assigned_to: toUserId,
      updated_by: user.id,
    };
    if (handoffNote.trim()) {
      updates.context = handoffNote.trim();
    }

    await supabase.from("action_cards").update(updates).eq("id", cardId);

    // Notify the recipient
    const card = cards.find((c) => c.id === cardId);
    const recipientName = teamMembers.find((m) => m.id === toUserId)?.name || "someone";
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          data: {
            userId: toUserId,
            type: "handoff",
            title: `${userName || "A teammate"} handed you a task`,
            body: card?.title || "New task",
            link: "/m",
          },
        }),
      });
    } catch {}
    void recipientName; // used for potential future toast

    setShowHandoff(null);
    setHandoffNote("");
    fetchCards();
  }

  // §4.15 — While user is focused on a card (snooze/handoff/edit/breakdown open),
  // use the snapshot of cards from when they entered focus. No new cards push in.
  const isFocused = focusedCardId || showSnooze || showHandoff || editingDraft || breakdown;
  const displayCards = isFocused && cardSnapshot ? cardSnapshot : cards;

  // Always show exactly 3 cards, selected by AI based on energy level
  const visibleCards = prioritizedIds
    ? prioritizedIds.map((id) => displayCards.find((c) => c.id === id)).filter(Boolean) as CardData[]
    : displayCards.slice(0, 3);
  const moreCount = Math.max(0, displayCards.length - visibleCards.length);
  const allClear = !loading && displayCards.length === 0;

  async function handleMakeSmaller(card: CardData) {
    setBreakingDown(card.id);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "chat",
          data: {
            message: `Break this task into 2-3 tiny, concrete next steps (each under 30 words). Task: "${card.title}". Context: ${card.context || "none"}. Return only a numbered list, nothing else.`,
            context: "",
          },
        }),
      });
      const data = await res.json();
      if (data.response) {
        const steps = data.response
          .split(/\n/)
          .map((s: string) => s.replace(/^\d+[\.\)]\s*/, "").trim())
          .filter((s: string) => s.length > 0);
        setBreakdown({ cardId: card.id, steps });
      }
    } catch {}
    setBreakingDown(null);
  }

  function getCardActions(card: CardData) {
    const actions: { label: string; variant: "primary" | "secondary" | "tertiary"; onClick: () => void }[] = [];

    actions.push({ label: "Done", variant: "tertiary", onClick: () => router.push(`/m/card/${card.id}?action=complete`) });

    actions.push({
      label: "Snooze",
      variant: "tertiary",
      onClick: () => setShowSnooze(showSnooze === card.id ? null : card.id),
    });

    actions.push({
      label: "Hand off to someone else",
      variant: "tertiary",
      onClick: () => setShowHandoff(showHandoff === card.id ? null : card.id),
    });

    actions.push({
      label: "Dismiss",
      variant: "tertiary",
      onClick: () => handleDismiss(card.id),
    });

    // Energy-aware: offer "Make it smaller" for non-email cards
    if (card.category !== "email") {
      actions.push({
        label: breakingDown === card.id ? "Thinking..." : "Create small tasks",
        variant: "tertiary",
        onClick: () => handleMakeSmaller(card),
      });
    }

    return actions;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-pulse text-text-secondary text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div>
      {aiGreeting ? (
        <GreetingBubble message={aiGreeting} />
      ) : (
        <div className="relative mb-6">
          <div
            className="rounded-3xl px-5 py-[18px] animate-pulse"
            style={{
              background: "var(--bubble-bg)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid rgba(255, 255, 255, 0.7)",
              boxShadow: "0 4px 20px rgba(100, 200, 220, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.9)",
            }}
          >
            <div className="h-3 bg-text-tertiary/20 rounded-full w-3/4 mb-2" />
            <div className="h-3 bg-text-tertiary/20 rounded-full w-1/2" />
          </div>
          <div
            className="absolute -bottom-2 left-6 w-4 h-4 rotate-45"
            style={{
              background: "var(--bubble-bg)",
              borderRight: "1px solid rgba(255, 255, 255, 0.7)",
              borderBottom: "1px solid rgba(255, 255, 255, 0.7)",
            }}
          />
        </div>
      )}

      {/* Energy chip selector — only mount once cards are prioritised so the
          entrance animation fires in the same render cycle as the cards */}
      {!allClear && prioritizedIds !== null && (
        <div
          className="flex items-center gap-2 mb-4"
          style={{
            animation: "cardEnter 0.4s cubic-bezier(0.22, 1, 0.36, 1) both",
            animationDelay: "0ms",
          }}
        >
          <span className="text-[11px] text-text-tertiary font-medium">Your energy level now:</span>
          {(["low", "medium", "high"] as const).map((level) => (
            <button
              key={level}
              onClick={() => setEnergy(level)}
              className={`inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full transition-all ${
                energy === level
                  ? level === "low"
                    ? "bg-amber-100 text-amber-700 border border-amber-200"
                    : level === "high"
                    ? "bg-green-100 text-green-700 border border-green-200"
                    : "bg-blue-100 text-blue-700 border border-blue-200"
                  : "bg-white/40 text-text-tertiary border border-transparent"
              }`}
            >
              <span style={{ fontSize: "1.5em", lineHeight: 1, display: "flex" }}>
                {level === "low" ? "🪫" : level === "medium" ? "⚡" : "🔥"}
              </span>
              {level === "low" ? "Low" : level === "medium" ? "Medium" : "High"}
            </button>
          ))}
          {prioritizing && (
            <div className="w-3 h-3 border border-accent border-t-transparent rounded-full animate-spin ml-1" />
          )}
        </div>
      )}

      {allClear ? (
        <AllClearState />
      ) : (
        <>
          {visibleCards.map((card, cardIndex) => (
            <div key={card.id}>
              {(() => {
                // If context is a bare "Step N of M" string (set by syncProcessCard),
                // promote it to the chip and don't repeat it in the card body.
                const stepMatch = card.context?.match(/^Step (\d+) of (\d+)$/);
                const stepLabel = stepMatch ? card.context! : card.linked_step_order != null ? `Step ${card.linked_step_order}` : undefined;
                const bodyContext = stepMatch ? "" : (card.context || "");
                return (
                  <ActionCard
                    id={card.id}
                    urgency={card.urgency}
                    title={card.title}
                    context={bodyContext}
                    attribution={card.attribution}
                    timeLabel={card.created_at ? timeAgo(card.created_at) : undefined}
                    stepLabel={stepLabel}
                    index={cardIndex}
                    onComplete={() => handleComplete(card.id)}
                    actions={getCardActions(card)}
                    onTap={() => router.push(`/m/card/${card.id}`)}
                  />
                );
              })()}
              {showSnooze === card.id && (
                <div className="flex gap-2 mb-4 -mt-2 ml-4">
                  {SNOOZE_OPTIONS.map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => handleSnooze(card.id, opt.ms)}
                      className="text-xs px-3 py-1.5 rounded-xl bg-white/60 border border-white/80 text-text-secondary font-medium backdrop-blur-sm transition-transform active:scale-95"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
              {showHandoff === card.id && (
                <div className="mb-4 -mt-2 ml-2 mr-2 rounded-2xl p-4" style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)" }}>
                  <p className="text-xs font-medium text-text-secondary mb-2">Hand off to:</p>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {teamMembers.map((member) => (
                      <button
                        key={member.id}
                        onClick={() => handleHandoff(card.id, member.id)}
                        className="text-xs px-3 py-1.5 rounded-xl bg-white/60 border border-white/80 text-text-primary font-medium backdrop-blur-sm transition-transform active:scale-95"
                      >
                        {member.name}
                      </button>
                    ))}
                  </div>
                  <input
                    value={handoffNote}
                    onChange={(e) => setHandoffNote(e.target.value)}
                    placeholder="Optional note..."
                    className="w-full text-xs px-3 py-1.5 rounded-xl bg-white/80 border border-white/60 text-text-primary placeholder:text-text-tertiary focus:outline-none"
                  />
                </div>
              )}
              {/* AI task breakdown */}
              {breakdown?.cardId === card.id && (
                <div className="mb-4 -mt-2 ml-2 mr-2 rounded-2xl p-4" style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)" }}>
                  <p className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide mb-2">Smaller steps</p>
                  <div className="space-y-2">
                    {breakdown.steps.map((step, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <div className="w-5 h-5 rounded-full bg-accent/10 text-accent text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                          {i + 1}
                        </div>
                        <p className="text-sm text-text-primary leading-snug">{step}</p>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setBreakdown(null)}
                    className="mt-3 text-xs text-text-tertiary font-medium"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {/* Undo toast — 5 second window */}
      {undoAction && (
        <div
          className="fixed bottom-24 left-4 right-4 mx-auto max-w-sm rounded-2xl px-4 py-3 flex items-center justify-between z-50"
          style={{
            background: "rgba(30, 30, 40, 0.88)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
        >
          <span className="text-white text-sm">{undoAction.label}</span>
          <button
            onClick={handleUndo}
            className="text-accent font-semibold text-sm ml-4 px-3 py-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
