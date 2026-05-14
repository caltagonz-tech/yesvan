"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useFeedbackMode } from "@/components/desktop/FeedbackModeContext";

/* ── AI Prompt types ── */
interface PromptTemplate {
  key: string;
  label: string;
  description: string;
  prompt: string;
  isCustom: boolean;
  defaultPrompt: string;
  updatedBy: string | null;
  updatedAt: string | null;
}

const TOOLS = [
  {
    href: "/d/settings/import",
    icon: "upload_file",
    label: "CSV Import",
    description: "Import students, hosts, or payments from CSV files",
  },
];

const NOTIFICATION_EVENTS = [
  { key: "payment_overdue", label: "Overdue payments", icon: "warning" },
  { key: "payment_due", label: "Upcoming payments", icon: "payments" },
  { key: "handoff", label: "Task hand-offs", icon: "swap_horiz" },
  { key: "process_blocked", label: "Blocked processes", icon: "block" },
  { key: "card_assigned", label: "New task assigned", icon: "assignment_ind" },
  { key: "reminder", label: "Reminders", icon: "alarm" },
];

export default function SettingsPage() {
  const supabase = createClient();
  const { feedbackMode, toggleFeedbackMode } = useFeedbackMode();
  const [notifChannel, setNotifChannel] = useState("push");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [quietStart, setQuietStart] = useState("");
  const [quietEnd, setQuietEnd] = useState("");
  const [enabledEvents, setEnabledEvents] = useState<string[]>(["payment_overdue", "handoff", "process_blocked"]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  /* ── AI Prompts state ── */
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [promptsLoading, setPromptsLoading] = useState(true);
  const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null);
  const [editedPrompts, setEditedPrompts] = useState<Record<string, string>>({});
  const [promptSaving, setPromptSaving] = useState<string | null>(null);
  const [promptSaved, setPromptSaved] = useState<string | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);

  useEffect(() => {
    async function loadPrefs() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("users")
        .select("notification_channel, telegram_chat_id, whatsapp_phone, quiet_hours_start, quiet_hours_end, notification_events")
        .eq("id", user.id)
        .single();

      if (data) {
        setNotifChannel(data.notification_channel || "push");
        setTelegramChatId(data.telegram_chat_id || "");
        setWhatsappPhone(data.whatsapp_phone || "");
        setQuietStart(data.quiet_hours_start || "");
        setQuietEnd(data.quiet_hours_end || "");
        if (data.notification_events) setEnabledEvents(data.notification_events);
      }
    }
    loadPrefs();
  }, [supabase]);

  /* ── Load AI prompts ── */
  const loadPrompts = useCallback(async () => {
    setPromptsLoading(true);
    try {
      const res = await fetch("/api/ai-prompts");
      if (res.ok) {
        const data = await res.json();
        setPrompts(data.prompts);
      }
    } catch {
      // silently fail — prompts section just stays loading
    }
    setPromptsLoading(false);
  }, []);

  useEffect(() => {
    loadPrompts();
  }, [loadPrompts]);

  async function handlePromptSave(key: string) {
    const text = editedPrompts[key];
    if (!text) return;
    setPromptSaving(key);
    setPromptError(null);
    try {
      const res = await fetch("/api/ai-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, prompt: text }),
      });
      if (!res.ok) {
        const err = await res.json();
        setPromptError(err.needsMigration
          ? "Database table not found. Run the ai_prompt_templates migration first."
          : err.error || "Failed to save");
      } else {
        setPromptSaved(key);
        setTimeout(() => setPromptSaved(null), 2000);
        // Refresh prompts to reflect saved state
        await loadPrompts();
        // Clear edited state for this key
        setEditedPrompts((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    } catch {
      setPromptError("Network error");
    }
    setPromptSaving(null);
  }

  async function handlePromptReset(key: string) {
    setPromptSaving(key);
    setPromptError(null);
    try {
      const res = await fetch("/api/ai-prompts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      if (res.ok) {
        setPromptSaved(key);
        setTimeout(() => setPromptSaved(null), 2000);
        await loadPrompts();
        setEditedPrompts((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    } catch {
      setPromptError("Network error");
    }
    setPromptSaving(null);
  }

  async function handleSave() {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const updates: Record<string, unknown> = {
      notification_channel: notifChannel,
      quiet_hours_start: quietStart || null,
      quiet_hours_end: quietEnd || null,
      notification_events: enabledEvents,
    };

    // Only save channel-specific fields if they're relevant
    if (notifChannel === "telegram") updates.telegram_chat_id = telegramChatId || null;
    if (notifChannel === "whatsapp") updates.whatsapp_phone = whatsappPhone || null;

    await supabase.from("users").update(updates).eq("id", user.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function toggleEvent(key: string) {
    setEnabledEvents((prev) =>
      prev.includes(key) ? prev.filter((e) => e !== key) : [...prev, key]
    );
  }

  return (
    <div>
      <h1 className="font-heading font-bold text-xl text-text-primary mb-6">Settings</h1>

      <div className="space-y-6">
        {/* Notification settings */}
        <section>
          <h2 className="font-heading font-semibold text-sm text-text-secondary uppercase tracking-wide mb-3">Notifications</h2>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-5">
            {/* Channel selection */}
            <div>
              <label className="text-sm font-medium text-text-primary block mb-2">Delivery channel</label>
              <p className="text-xs text-text-tertiary mb-3">Choose how you want to receive important alerts on your phone.</p>
              <div className="flex gap-2">
                {[
                  { key: "push", label: "In-app only", icon: "desktop_windows" },
                  { key: "telegram", label: "Telegram", icon: "send" },
                  { key: "whatsapp", label: "WhatsApp", icon: "chat" },
                ].map((ch) => (
                  <button
                    key={ch.key}
                    onClick={() => setNotifChannel(ch.key)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                      notifChannel === ch.key
                        ? "bg-accent/10 text-accent border border-accent/30"
                        : "bg-gray-50 text-text-secondary border border-gray-200 hover:bg-gray-100"
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">{ch.icon}</span>
                    {ch.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Channel-specific config */}
            {notifChannel === "telegram" && (
              <div>
                <label className="text-sm font-medium text-text-primary block mb-1">Telegram Chat ID</label>
                <p className="text-xs text-text-tertiary mb-2">
                  Message <code className="px-1 py-0.5 bg-gray-100 rounded text-[11px]">@userinfobot</code> on Telegram to get your chat ID.
                </p>
                <input
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  placeholder="e.g. 123456789"
                  className="w-64 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </div>
            )}

            {notifChannel === "whatsapp" && (
              <div>
                <label className="text-sm font-medium text-text-primary block mb-1">WhatsApp Phone Number</label>
                <p className="text-xs text-text-tertiary mb-2">Include country code, e.g. +1 for Canada/US.</p>
                <input
                  value={whatsappPhone}
                  onChange={(e) => setWhatsappPhone(e.target.value)}
                  placeholder="e.g. +16045551234"
                  className="w-64 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </div>
            )}

            {/* Quiet hours */}
            <div>
              <label className="text-sm font-medium text-text-primary block mb-1">Quiet hours</label>
              <p className="text-xs text-text-tertiary mb-2">No external notifications during these hours.</p>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={quietStart}
                  onChange={(e) => setQuietStart(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
                <span className="text-text-tertiary text-sm">to</span>
                <input
                  type="time"
                  value={quietEnd}
                  onChange={(e) => setQuietEnd(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </div>
            </div>

            {/* Event selection */}
            <div>
              <label className="text-sm font-medium text-text-primary block mb-2">Notify me about</label>
              <div className="space-y-2">
                {NOTIFICATION_EVENTS.map((evt) => (
                  <label
                    key={evt.key}
                    className="flex items-center gap-3 cursor-pointer group"
                  >
                    <input
                      type="checkbox"
                      checked={enabledEvents.includes(evt.key)}
                      onChange={() => toggleEvent(evt.key)}
                      className="rounded border-gray-300 text-accent focus:ring-accent/30"
                    />
                    <span className="material-symbols-outlined text-[18px] text-text-tertiary group-hover:text-text-secondary">
                      {evt.icon}
                    </span>
                    <span className="text-sm text-text-secondary group-hover:text-text-primary">{evt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Save */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-text-primary text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save notification settings"}
              </button>
              {saved && (
                <span className="text-sm text-green-600 font-medium">Saved!</span>
              )}
            </div>
          </div>
        </section>

        {/* Tools */}
        <section>
          <h2 className="font-heading font-semibold text-sm text-text-secondary uppercase tracking-wide mb-3">Tools</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {TOOLS.map((tool) => (
              <Link
                key={tool.href}
                href={tool.href}
                className="rounded-2xl border border-gray-200 bg-white p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-[20px] text-accent">{tool.icon}</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">{tool.label}</p>
                  <p className="text-xs text-text-tertiary mt-0.5">{tool.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* AI Prompts */}
        <section>
          <h2 className="font-heading font-semibold text-sm text-text-secondary uppercase tracking-wide mb-3">AI Prompts</h2>
          <p className="text-xs text-text-tertiary mb-4">
            Customize the prompts used for each AI interaction. Changes apply immediately to all users. Reset to default anytime.
          </p>

          {promptError && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-4">
              {promptError}
            </div>
          )}

          {promptsLoading ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-5">
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse">
                    <div className="h-4 bg-gray-100 rounded w-1/3 mb-1" />
                    <div className="h-3 bg-gray-100 rounded w-2/3" />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {prompts.map((p) => {
                const isExpanded = expandedPrompt === p.key;
                const currentText = editedPrompts[p.key] ?? p.prompt;
                const hasChanges = editedPrompts[p.key] !== undefined && editedPrompts[p.key] !== p.prompt;
                const isSaving = promptSaving === p.key;
                const justSaved = promptSaved === p.key;

                return (
                  <div
                    key={p.key}
                    className="rounded-2xl border border-gray-200 bg-white overflow-hidden"
                  >
                    {/* Header — click to expand/collapse */}
                    <button
                      onClick={() => setExpandedPrompt(isExpanded ? null : p.key)}
                      className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
                    >
                      <span
                        className="material-symbols-outlined text-[18px] text-text-tertiary transition-transform"
                        style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}
                      >
                        chevron_right
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-text-primary">{p.label}</span>
                          {p.isCustom && (
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-accent bg-accent/10 px-1.5 py-0.5 rounded-md">
                              Customized
                            </span>
                          )}
                          {justSaved && (
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-green-600 bg-green-50 px-1.5 py-0.5 rounded-md">
                              Saved
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-text-tertiary mt-0.5 truncate">{p.description}</p>
                      </div>
                      <span className="material-symbols-outlined text-[16px] text-text-tertiary">
                        {isExpanded ? "expand_less" : "expand_more"}
                      </span>
                    </button>

                    {/* Expanded editor */}
                    {isExpanded && (
                      <div className="px-5 pb-5 border-t border-gray-100">
                        <textarea
                          value={currentText}
                          onChange={(e) =>
                            setEditedPrompts((prev) => ({
                              ...prev,
                              [p.key]: e.target.value,
                            }))
                          }
                          rows={Math.min(20, Math.max(6, currentText.split("\n").length + 2))}
                          className="w-full mt-4 px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-text-primary font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/30 resize-y"
                          spellCheck={false}
                        />

                        <div className="flex items-center gap-3 mt-3">
                          <button
                            onClick={() => handlePromptSave(p.key)}
                            disabled={!hasChanges || isSaving}
                            className="px-4 py-2 rounded-xl bg-text-primary text-white text-sm font-semibold hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
                          >
                            {isSaving ? "Saving..." : "Save changes"}
                          </button>

                          {p.isCustom && (
                            <button
                              onClick={() => handlePromptReset(p.key)}
                              disabled={isSaving}
                              className="px-4 py-2 rounded-xl text-sm font-medium text-text-tertiary hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-30"
                            >
                              Reset to default
                            </button>
                          )}

                          {hasChanges && (
                            <button
                              onClick={() =>
                                setEditedPrompts((prev) => {
                                  const next = { ...prev };
                                  delete next[p.key];
                                  return next;
                                })
                              }
                              className="px-4 py-2 rounded-xl text-sm font-medium text-text-tertiary hover:text-text-secondary transition-colors"
                            >
                              Discard
                            </button>
                          )}

                          {p.isCustom && p.updatedAt && (
                            <span className="text-xs text-text-tertiary ml-auto">
                              Last edited {new Date(p.updatedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Feedback mode */}
        <section>
          <h2 className="font-heading font-semibold text-sm text-text-secondary uppercase tracking-wide mb-3">Feedback</h2>
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-text-primary">Annotation mode</p>
                <p className="text-xs text-text-tertiary mt-0.5">
                  {feedbackMode
                    ? "Active — click any element on any page to leave a comment."
                    : "Click any element to pin a comment. Pins are saved and visible next session."}
                </p>
              </div>
              <button
                onClick={toggleFeedbackMode}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                  feedbackMode ? "bg-accent" : "bg-gray-200"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition duration-200 ${
                    feedbackMode ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
            {feedbackMode && (
              <div className="mt-3 flex items-center gap-2 text-xs text-accent font-medium">
                <span className="material-symbols-outlined text-[14px]">mode_comment</span>
                Annotation mode is on — hover to highlight, click to comment
              </div>
            )}
          </div>
        </section>

        {/* App info */}
        <section>
          <h2 className="font-heading font-semibold text-sm text-text-secondary uppercase tracking-wide mb-3">About</h2>
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-sm text-text-primary font-medium">YES Vancity</p>
            <p className="text-xs text-text-tertiary mt-1">AI-powered student exchange management assistant</p>
          </div>
        </section>
      </div>
    </div>
  );
}
