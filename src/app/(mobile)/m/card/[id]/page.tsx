"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type CardData = {
  id: string;
  category: string;
  urgency: string;
  title: string;
  context: string | null;
  status: string;
  draft_email_subject?: string | null;
  draft_email_body?: string | null;
  draft_email_to?: string | null;
  assigned_to?: string | null;
};

type Message = {
  role: "assistant" | "user";
  content: string;
  suggestions?: string[];
  draftEmail?: { to: string; subject: string; body: string };
};

export default function CardConversationPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-gradient)" }}><div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" /></div>}>
      <CardConversationContent />
    </Suspense>
  );
}

function CardConversationContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const actionParam = searchParams.get("action");
  const supabase = createClient();

  const [card, setCard] = useState<CardData | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [thinking, setThinking] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customText, setCustomText] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [editingDraft, setEditingDraft] = useState(false);
  const [draftBody, setDraftBody] = useState("");
  const [completed, setCompleted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load card and get initial AI suggestions
  useEffect(() => {
    async function init() {
      const { data } = await supabase
        .from("action_cards")
        .select("*")
        .eq("id", id)
        .single();

      if (!data) { router.push("/m"); return; }
      setCard(data);

      // If action=complete, start a completion conversation
      if (actionParam === "complete") {
        try {
          const res = await fetch("/api/ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "card_assist",
              data: {
                cardId: data.id,
                title: data.title,
                context: data.context,
                category: data.category,
                urgency: data.urgency,
                userMessage: "__COMPLETE_FLOW__",
                history: [],
              },
            }),
          });
          const result = await res.json();
          setMessages([{
            role: "assistant",
            content: result.message || `Before I mark this done — is there anything to update? For example, who was assigned, what was decided, any dates or details to record?`,
            suggestions: result.suggestions || ["Nothing to update, just mark it done", "Yes, let me update some info"],
          }]);
        } catch {
          setMessages([{
            role: "assistant",
            content: `Before I mark **${data.title}** as done — is there anything to update? Any details to record?`,
            suggestions: ["Nothing to update, just mark it done", "Yes, let me update some info"],
          }]);
        }
      } else {
        // Normal card conversation — get AI suggestions
        try {
          const res = await fetch("/api/ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "card_assist",
              data: {
                cardId: data.id,
                title: data.title,
                context: data.context,
                category: data.category,
                urgency: data.urgency,
                hasDraft: !!(data.draft_email_body),
                draftTo: data.draft_email_to,
                draftSubject: data.draft_email_subject,
              },
            }),
          });
          const result = await res.json();
          if (result.message) {
            setMessages([{
              role: "assistant",
              content: result.message,
              suggestions: result.suggestions || [],
            }]);
          }
        } catch {
          setMessages([{
            role: "assistant",
            content: `Let's work on this: **${data.title}**. What would you like to do?`,
            suggestions: ["Draft an email", "Mark as done", "Tell me more about this"],
          }]);
        }
      }
      setLoading(false);
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  async function handleAction(action: string) {
    // Add user message
    setMessages(prev => [...prev, { role: "user", content: action }]);
    setShowCustomInput(false);
    setCustomText("");
    setThinking(true);

    // Special actions — completion triggers
    if (
      action.toLowerCase().includes("mark as done") ||
      action.toLowerCase().includes("that's all") ||
      action.toLowerCase().includes("nothing to update, just mark it done")
    ) {
      await completeCard();
      setThinking(false);
      return;
    }

    if (action.toLowerCase().includes("review draft") || action.toLowerCase().includes("see the draft")) {
      if (card?.draft_email_body) {
        setMessages(prev => [...prev, {
          role: "assistant",
          content: "Here's the draft. You can edit it and send when ready.",
          draftEmail: {
            to: card.draft_email_to || "",
            subject: card.draft_email_subject || "",
            body: card.draft_email_body || "",
          },
          suggestions: ["Send it", "Rewrite with different tone", "Discard draft"],
        }]);
        setDraftBody(card.draft_email_body || "");
        setEditingDraft(true);
        setThinking(false);
        return;
      }
    }

    // Send to AI for contextual response
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "card_assist",
          data: {
            cardId: card?.id,
            title: card?.title,
            context: card?.context,
            category: card?.category,
            urgency: card?.urgency,
            hasDraft: !!(card?.draft_email_body),
            draftTo: card?.draft_email_to,
            draftSubject: card?.draft_email_subject,
            userMessage: action,
            history: messages.map(m => ({ role: m.role, content: m.content })),
          },
        }),
      });
      const result = await res.json();

      // Check if AI generated a draft email
      if (result.draftEmail) {
        setMessages(prev => [...prev, {
          role: "assistant",
          content: result.message || "Here's the draft:",
          draftEmail: result.draftEmail,
          suggestions: result.suggestions || ["Send it", "Rewrite", "Discard"],
        }]);
        setDraftBody(result.draftEmail.body);
        setEditingDraft(true);
      } else {
        setMessages(prev => [...prev, {
          role: "assistant",
          content: result.message || "Done!",
          suggestions: result.suggestions || [],
        }]);
      }

      // If AI says to complete the card
      if (result.completeCard) {
        await completeCard();
      }
    } catch {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Something went wrong. Try again?",
        suggestions: ["Try again"],
      }]);
    }
    setThinking(false);
  }

  async function completeCard() {
    if (!card) return;
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("action_cards")
      .update({ status: "completed", updated_by: user?.id })
      .eq("id", card.id);
    setCompleted(true);
    setMessages(prev => [...prev, {
      role: "assistant",
      content: "Done! Card completed. 🎉",
      suggestions: ["Back to home"],
    }]);
  }

  async function handleSendEmail() {
    if (!card || !draftBody) return;
    setSendingEmail(true);
    try {
      const res = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send",
          data: {
            to: card.draft_email_to || "",
            subject: card.draft_email_subject || "",
            body: draftBody,
          },
        }),
      });
      const result = await res.json();
      if (result.success) {
        setEditingDraft(false);
        await completeCard();
      } else {
        setMessages(prev => [...prev, {
          role: "assistant",
          content: "Failed to send. Want to try again?",
          suggestions: ["Try again", "Save for later"],
        }]);
      }
    } catch {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Network error. The email wasn't sent.",
        suggestions: ["Try again", "Back to home"],
      }]);
    }
    setSendingEmail(false);
  }

  function renderMarkdown(text: string) {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-gradient)" }}>
        <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  const urgencyColors: Record<string, string> = {
    urgent: "var(--urgent)",
    medium: "var(--medium)",
    low: "var(--low)",
    info: "var(--info)",
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg-gradient)" }}>
      {/* Header */}
      <div
        className="sticky top-0 z-10 px-4 py-3 flex items-center gap-3"
        style={{
          background: "var(--glass-bg)",
          backdropFilter: "blur(24px) saturate(180%)",
          WebkitBackdropFilter: "blur(24px) saturate(180%)",
          borderBottom: "1px solid var(--glass-border)",
        }}
      >
        <button
          onClick={() => router.push("/m")}
          className="material-symbols-outlined text-text-secondary text-[22px] -ml-1"
        >
          arrow_back
        </button>
        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{
            background: urgencyColors[card?.urgency || "medium"],
            boxShadow: `0 0 8px ${urgencyColors[card?.urgency || "medium"]}`,
          }}
        />
        <h1 className="font-heading font-semibold text-[15px] text-text-primary truncate flex-1">
          {card?.title}
        </h1>
        {completed && (
          <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Done</span>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((msg, i) => (
          <div key={i}>
            {msg.role === "assistant" ? (
              <div className="max-w-[88%]">
                <div
                  className="rounded-2xl rounded-tl-md px-4 py-3 text-sm leading-relaxed text-text-primary"
                  style={{
                    background: "var(--glass-bg)",
                    backdropFilter: "blur(16px)",
                    WebkitBackdropFilter: "blur(16px)",
                    border: "1px solid var(--glass-border)",
                  }}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                />

                {/* Draft email preview */}
                {msg.draftEmail && (
                  <div
                    className="mt-2 rounded-2xl p-4"
                    style={{
                      background: "var(--glass-bg)",
                      border: "1px solid var(--glass-border)",
                    }}
                  >
                    <div className="text-xs text-text-tertiary mb-1">To: {msg.draftEmail.to}</div>
                    <div className="text-xs text-text-tertiary mb-3">Subject: {msg.draftEmail.subject}</div>
                    <textarea
                      value={draftBody}
                      onChange={(e) => setDraftBody(e.target.value)}
                      className="w-full min-h-[140px] text-sm text-text-primary bg-white/80 rounded-xl border border-white/60 p-3 focus:outline-none resize-y"
                    />
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={handleSendEmail}
                        disabled={sendingEmail}
                        className="text-[13px] font-semibold px-4 py-2.5 rounded-[14px] bg-text-primary text-white shadow-sm transition-transform active:scale-95 disabled:opacity-50"
                      >
                        {sendingEmail ? "Sending..." : "Send email"}
                      </button>
                      <button
                        onClick={() => setEditingDraft(false)}
                        className="text-[13px] font-semibold px-4 py-2.5 rounded-[14px] text-text-secondary"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Suggestion buttons */}
                {msg.suggestions && msg.suggestions.length > 0 && i === messages.length - 1 && !thinking && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {msg.suggestions.map((s, j) => (
                      <button
                        key={j}
                        onClick={() => {
                          if (s === "Back to home") { router.push("/m"); return; }
                          if (s === "Send it") { handleSendEmail(); return; }
                          handleAction(s);
                        }}
                        className="text-[13px] font-medium px-4 py-2 rounded-2xl transition-transform active:scale-95"
                        style={{
                          background: "var(--glass-bg)",
                          backdropFilter: "blur(12px)",
                          WebkitBackdropFilter: "blur(12px)",
                          border: "1px solid var(--glass-border)",
                          color: "var(--text-primary)",
                        }}
                      >
                        {s}
                      </button>
                    ))}
                    {!showCustomInput && (
                      <button
                        onClick={() => setShowCustomInput(true)}
                        className="text-[13px] font-medium px-4 py-2 rounded-2xl text-text-tertiary"
                        style={{
                          border: "1px dashed var(--glass-border)",
                        }}
                      >
                        Something else...
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="max-w-[80%] ml-auto">
                <div
                  className="rounded-2xl rounded-tr-md px-4 py-3 text-sm leading-relaxed text-white"
                  style={{
                    background: "var(--accent)",
                  }}
                >
                  {msg.content}
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Thinking indicator */}
        {thinking && (
          <div className="max-w-[88%]">
            <div
              className="rounded-2xl rounded-tl-md px-4 py-3 text-sm text-text-tertiary"
              style={{
                background: "var(--glass-bg)",
                border: "1px solid var(--glass-border)",
              }}
            >
              <span className="inline-flex gap-1">
                <span className="w-1.5 h-1.5 bg-text-tertiary/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 bg-text-tertiary/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 bg-text-tertiary/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Custom input */}
      {showCustomInput && !completed && (
        <div
          className="sticky bottom-0 px-4 py-3 flex gap-2"
          style={{
            background: "var(--glass-bg)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            borderTop: "1px solid var(--glass-border)",
          }}
        >
          <input
            type="text"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && customText.trim()) handleAction(customText.trim()); }}
            placeholder="Type something else..."
            autoFocus
            className="flex-1 text-sm px-4 py-2.5 rounded-2xl bg-white/70 border border-white/80 text-text-primary placeholder:text-text-tertiary focus:outline-none"
          />
          <button
            onClick={() => { if (customText.trim()) handleAction(customText.trim()); }}
            disabled={!customText.trim()}
            className="material-symbols-outlined text-accent text-[22px] px-2 disabled:opacity-30"
          >
            send
          </button>
        </div>
      )}
    </div>
  );
}
