"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Message = {
  role: "user" | "assistant";
  content: string;
};

/** Simple markdown: bold, italic */
function renderMarkdown(text: string) {
  // Replace **bold** and *italic*
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

const ENTITY_TYPES = [
  { key: "student", label: "Student", icon: "school" },
  { key: "lead", label: "Lead", icon: "person_add" },
  { key: "host", label: "Host Family", icon: "home" },
];

export default function IntakePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-40"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>}>
      <IntakeContent />
    </Suspense>
  );
}

function IntakeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const entityParam = searchParams.get("type");

  const [entityType, setEntityType] = useState<string | null>(entityParam);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [entityId, setEntityId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [followUpActions, setFollowUpActions] = useState<string[]>([]);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const DRAFT_KEY = "yes-intake-draft";

  // Scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, suggestions]);

  // Save progress to localStorage whenever messages change (§6.1 — pause anytime)
  useEffect(() => {
    if (entityType && messages.length > 0 && !done) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ entityType, messages }));
    }
  }, [entityType, messages, done]);

  // Check for saved draft on mount
  useEffect(() => {
    if (hasRestoredDraft || entityParam) return;
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const draft = JSON.parse(saved);
        if (draft.entityType && draft.messages?.length > 0) {
          setEntityType(draft.entityType);
          setMessages(draft.messages);
          setHasRestoredDraft(true);
        }
      }
    } catch { /* ignore invalid JSON */ }
  }, [hasRestoredDraft, entityParam]);

  // Start conversation when entity type is selected (only if no restored draft)
  useEffect(() => {
    if (entityType && messages.length === 0 && !hasRestoredDraft) {
      startConversation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType]);

  async function startConversation() {
    setLoading(true);
    setSuggestions([]);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "intake_step", data: { entityType, history: [], answer: "" } }),
      });
      const data = await res.json();
      if (data.message) {
        setMessages([{ role: "assistant", content: data.message }]);
      }
      if (data.suggestions?.length) {
        setSuggestions(data.suggestions);
      }
    } catch {
      setMessages([{ role: "assistant", content: "Hey! Let's get started. What's their first name?" }]);
    }
    setLoading(false);
    setShowCustomInput(false);
  }

  async function sendAnswer(answer: string) {
    if (!answer.trim() || loading || !entityType) return;
    setInput("");
    setSuggestions([]);
    setShowCustomInput(false);

    const newMessages: Message[] = [...messages, { role: "user", content: answer.trim() }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "intake_step",
          data: {
            entityType,
            history: newMessages,
            answer: answer.trim(),
          },
        }),
      });
      const data = await res.json();

      if (data.message) {
        setMessages([...newMessages, { role: "assistant", content: data.message }]);
      }

      if (data.suggestions?.length) {
        setSuggestions(data.suggestions);
      }

      if (data.done) {
        setDone(true);
        setCreatedId(data.displayId || null);
        setEntityId(data.entityId || null);
        localStorage.removeItem(DRAFT_KEY);
        if (data.followUpActions?.length) {
          setFollowUpActions(data.followUpActions);
        }
      }
    } catch {
      setMessages([...newMessages, { role: "assistant", content: "Something went wrong. Can you try that again?" }]);
    }
    setLoading(false);
  }

  async function handleFollowUp(action: string) {
    if (action === "That's all for now") {
      router.push("/m");
      return;
    }

    // Navigate to process checklist if available
    if (entityId) {
      const processRoutes: Record<string, string> = {
        "Open accommodation checklist": "homestay_intake",
        "Open airport pickup checklist": "airport_arrival",
      };
      const processName = processRoutes[action];
      if (processName) {
        router.push(`/m/process/${entityId}/${processName}`);
        return;
      }
    }

    // Create an action card for the follow-up task
    try {
      await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "process_capture",
          data: { text: `${action} for ${createdId || "new record"}` },
        }),
      });
    } catch { /* non-blocking */ }

    // Remove the selected action and show feedback
    setFollowUpActions((prev) => prev.filter((a) => a !== action));
    setMessages((prev) => [
      ...prev,
      { role: "user", content: action },
      { role: "assistant", content: `Got it — I've added "${action}" to your task list. Anything else?` },
    ]);
  }

  function handleSend() {
    sendAnswer(input);
  }

  // Entity type selection screen
  if (!entityType) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="text-text-secondary">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h1 className="font-heading font-semibold text-lg text-text-primary">Add new</h1>
        </div>

        <p className="text-text-secondary text-sm mb-4">What would you like to add?</p>

        {/* Resume saved draft (§6.1 — pause anytime, resume where left off) */}
        {(() => {
          try {
            const saved = localStorage.getItem("yes-intake-draft");
            if (saved) {
              const draft = JSON.parse(saved);
              const label = ENTITY_TYPES.find((e) => e.key === draft.entityType)?.label || draft.entityType;
              return (
                <button
                  onClick={() => {
                    setEntityType(draft.entityType);
                    setMessages(draft.messages);
                    setHasRestoredDraft(true);
                  }}
                  className="mb-3 flex items-center gap-4 rounded-2xl p-4 text-left transition-transform active:scale-[0.98]"
                  style={{
                    background: "linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(155, 122, 255, 0.05))",
                    border: "1px solid rgba(139, 92, 246, 0.3)",
                    boxShadow: "var(--glass-shadow)",
                  }}
                >
                  <span className="material-symbols-outlined text-2xl text-accent">edit_note</span>
                  <div>
                    <p className="font-semibold text-accent text-[15px]">Continue adding {label}</p>
                    <p className="text-xs text-text-tertiary">{draft.messages.length} messages — pick up where you left off</p>
                  </div>
                </button>
              );
            }
          } catch { /* ignore */ }
          return null;
        })()}

        <div className="flex flex-col gap-3">
          {ENTITY_TYPES.map((et) => (
            <button
              key={et.key}
              onClick={() => setEntityType(et.key)}
              className="flex items-center gap-4 rounded-2xl p-4 text-left transition-transform active:scale-[0.98]"
              style={{
                background: "var(--glass-bg)",
                backdropFilter: "blur(24px) saturate(180%)",
                WebkitBackdropFilter: "blur(24px) saturate(180%)",
                border: "1px solid var(--glass-border)",
                boxShadow: "var(--glass-shadow)",
              }}
            >
              <span
                className="material-symbols-outlined text-2xl rounded-xl w-11 h-11 flex items-center justify-center shrink-0"
                style={{ background: "var(--accent)", color: "white", display: "flex" }}
              >
                {et.icon}
              </span>
              <div>
                <p className="font-semibold text-text-primary text-[15px]">{et.label}</p>
                <p className="text-xs text-text-tertiary">Add via guided conversation</p>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-6 text-center">
          <button
            onClick={() => router.push("/m/capture")}
            className="text-sm text-accent font-medium"
          >
            Or just quick-capture a note
          </button>
        </div>
      </div>
    );
  }

  // Conversation screen
  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 10rem)" }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => {
            if (done) {
              localStorage.removeItem(DRAFT_KEY);
              router.push("/m");
              return;
            }
            router.back();
          }}
          className="text-text-secondary"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className="font-heading font-semibold text-lg text-text-primary">
          New {ENTITY_TYPES.find((e) => e.key === entityType)?.label}
        </h1>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pb-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-text-primary text-white rounded-br-lg"
                  : "rounded-bl-lg"
              }`}
              style={
                msg.role === "assistant"
                  ? {
                      background: "var(--glass-bg)",
                      backdropFilter: "blur(24px)",
                      WebkitBackdropFilter: "blur(24px)",
                      border: "1px solid var(--glass-border)",
                    }
                  : undefined
              }
            >
              {msg.role === "assistant" ? renderMarkdown(msg.content) : msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div
              className="rounded-2xl rounded-bl-lg px-4 py-3"
              style={{
                background: "var(--glass-bg)",
                border: "1px solid var(--glass-border)",
              }}
            >
              <div className="flex gap-1.5">
                <div className="w-2 h-2 rounded-full bg-text-tertiary animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-2 h-2 rounded-full bg-text-tertiary animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-2 h-2 rounded-full bg-text-tertiary animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        {/* Created badge + follow-up actions */}
        {done && createdId && (
          <div className="mt-4">
            <div className="text-center">
              <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 bg-green-50 text-green-700 text-sm font-medium">
                <span className="material-symbols-outlined text-lg">check_circle</span>
                {createdId} created
              </div>
            </div>

            {/* Follow-up action buttons — maintain momentum */}
            {followUpActions.length > 0 && (
              <div className="mt-4 space-y-2">
                {followUpActions.map((action) => (
                  <button
                    key={action}
                    onClick={() => handleFollowUp(action)}
                    className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm transition-transform active:scale-[0.97]"
                    style={{
                      background: action === "That's all for now" ? "rgba(255,255,255,0.4)" : "var(--glass-bg)",
                      backdropFilter: "blur(24px)",
                      WebkitBackdropFilter: "blur(24px)",
                      border: action === "That's all for now" ? "1px solid rgba(255,255,255,0.3)" : "1px solid var(--glass-border)",
                    }}
                  >
                    <span className="material-symbols-outlined text-[18px] text-accent">
                      {action === "That's all for now" ? "check" :
                       action.includes("paperwork") || action.includes("Send") ? "mail" :
                       action.includes("accommodation") || action.includes("availability") ? "home" :
                       action.includes("airport") || action.includes("pickup") ? "flight" :
                       action.includes("follow-up") || action.includes("Schedule") ? "event" :
                       "arrow_forward"}
                    </span>
                    <span className={`font-medium ${action === "That's all for now" ? "text-text-tertiary" : "text-text-primary"}`}>
                      {action}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {followUpActions.length === 0 && (
              <button
                onClick={() => router.push("/m")}
                className="block mx-auto mt-3 text-sm text-accent font-medium"
              >
                Back to home
              </button>
            )}
          </div>
        )}
      </div>

      {/* Suggestion chips — tappable prefilled answers */}
      {!done && !loading && suggestions.length > 0 && (
        <div className="pb-2">
          <div className="flex flex-wrap gap-2 mb-2">
            {suggestions.map((sug) => (
              <button
                key={sug}
                onClick={() => sendAnswer(sug)}
                className="px-3.5 py-2 rounded-2xl text-[13px] font-medium transition-all active:scale-95"
                style={{
                  background: "var(--glass-bg)",
                  backdropFilter: "blur(24px)",
                  WebkitBackdropFilter: "blur(24px)",
                  border: "1px solid var(--glass-border)",
                  color: "var(--text-primary)",
                }}
              >
                {sug}
              </button>
            ))}
            {/* "Something else" to show custom input */}
            {!showCustomInput && (
              <button
                onClick={() => { setShowCustomInput(true); setTimeout(() => inputRef.current?.focus(), 100); }}
                className="px-3.5 py-2 rounded-2xl text-[13px] font-medium text-text-tertiary transition-all active:scale-95"
                style={{
                  background: "rgba(255,255,255,0.3)",
                  border: "1px solid rgba(255,255,255,0.2)",
                }}
              >
                Something else...
              </button>
            )}
          </div>
        </div>
      )}

      {/* Save & continue later (§6.1) */}
      {!done && messages.length > 2 && (
        <button
          onClick={() => router.back()}
          className="text-xs text-text-tertiary font-medium text-center py-1 mb-1"
        >
          Save and continue later
        </button>
      )}

      {/* Text input — always shown when no suggestions, or when "Something else" is tapped */}
      {!done && (suggestions.length === 0 || showCustomInput) && (
        <div
          className="flex items-center gap-2 rounded-2xl px-4 py-2"
          style={{
            background: "var(--glass-bg)",
            backdropFilter: "blur(24px) saturate(180%)",
            WebkitBackdropFilter: "blur(24px) saturate(180%)",
            border: "1px solid var(--glass-border)",
          }}
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Type your answer..."
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none py-2"
            disabled={loading}
            autoFocus
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-text-primary text-white disabled:opacity-30 transition-transform active:scale-90"
          >
            <span className="material-symbols-outlined text-lg">arrow_upward</span>
          </button>
        </div>
      )}
    </div>
  );
}
