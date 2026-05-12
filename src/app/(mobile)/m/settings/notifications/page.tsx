"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { t, type Lang } from "@/lib/i18n";

const CHANNELS = [
  { key: "push", icon: "desktop_windows" },
  { key: "telegram", icon: "send" },
  { key: "whatsapp", icon: "chat" },
] as const;

const NOTIFICATION_EVENTS = [
  { key: "payment_overdue", icon: "warning" },
  { key: "payment_due", icon: "payments" },
  { key: "handoff", icon: "swap_horiz" },
  { key: "process_blocked", icon: "block" },
  { key: "card_assigned", icon: "assignment_ind" },
  { key: "reminder", icon: "alarm" },
];

const EVENT_LABEL_KEYS: Record<string, string> = {
  payment_overdue: "overdue_payments",
  payment_due: "upcoming_payments",
  handoff: "task_handoffs",
  process_blocked: "blocked_processes",
  card_assigned: "new_task_assigned",
  reminder: "reminders",
};

export default function MobileNotificationsPage() {
  const supabase = createClient();
  const router = useRouter();
  const [lang, setLang] = useState<Lang>("en");
  const [channel, setChannel] = useState("push");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [quietStart, setQuietStart] = useState("");
  const [quietEnd, setQuietEnd] = useState("");
  const [enabledEvents, setEnabledEvents] = useState<string[]>([
    "payment_overdue",
    "handoff",
    "process_blocked",
  ]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("yes-lang") as Lang | null;
    if (stored) setLang(stored);

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("users")
        .select(
          "notification_channel, telegram_chat_id, whatsapp_phone, quiet_hours_start, quiet_hours_end, notification_events"
        )
        .eq("id", user.id)
        .single();

      if (data) {
        setChannel(data.notification_channel || "push");
        setTelegramChatId(data.telegram_chat_id || "");
        setWhatsappPhone(data.whatsapp_phone || "");
        setQuietStart(data.quiet_hours_start || "");
        setQuietEnd(data.quiet_hours_end || "");
        if (data.notification_events) setEnabledEvents(data.notification_events);
      }
    }
    load();
  }, [supabase]);

  async function handleSave() {
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    const updates: Record<string, unknown> = {
      notification_channel: channel,
      quiet_hours_start: quietStart || null,
      quiet_hours_end: quietEnd || null,
      notification_events: enabledEvents,
    };
    if (channel === "telegram") updates.telegram_chat_id = telegramChatId || null;
    if (channel === "whatsapp") updates.whatsapp_phone = whatsappPhone || null;

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

  const channelLabelKey: Record<string, string> = {
    push: "in_app_only",
    telegram: "telegram",
    whatsapp: "whatsapp",
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-2xl flex items-center justify-center transition-transform active:scale-90"
          style={{
            background: "var(--glass-bg)",
            backdropFilter: "blur(24px)",
            border: "1px solid var(--glass-border)",
          }}
        >
          <span className="material-symbols-outlined text-[20px] text-text-secondary">
            arrow_back
          </span>
        </button>
        <h1 className="font-heading font-semibold text-lg text-text-primary">
          {t("notifications", lang)}
        </h1>
      </div>

      {/* Delivery channel */}
      <div
        className="rounded-3xl p-5 mb-4"
        style={{
          background: "var(--glass-bg)",
          backdropFilter: "blur(24px) saturate(180%)",
          WebkitBackdropFilter: "blur(24px) saturate(180%)",
          border: "1px solid var(--glass-border)",
          boxShadow: "var(--glass-shadow)",
        }}
      >
        <p className="text-sm font-medium text-text-primary mb-1">
          {t("delivery_channel", lang)}
        </p>
        <p className="text-xs text-text-tertiary mb-3">
          {t("delivery_channel_desc", lang)}
        </p>
        <div className="flex gap-2">
          {CHANNELS.map((ch) => (
            <button
              key={ch.key}
              onClick={() => setChannel(ch.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-[13px] font-medium transition-all active:scale-95 ${
                channel === ch.key
                  ? "bg-accent/15 text-accent border border-accent/30"
                  : "bg-white/30 text-text-secondary border border-white/20"
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">{ch.icon}</span>
              {t(channelLabelKey[ch.key], lang)}
            </button>
          ))}
        </div>

        {/* Telegram config */}
        {channel === "telegram" && (
          <div className="mt-4">
            <label className="text-sm font-medium text-text-primary block mb-1">
              {t("telegram_chat_id", lang)}
            </label>
            <p className="text-[11px] text-text-tertiary mb-2">{t("telegram_hint", lang)}</p>
            <input
              value={telegramChatId}
              onChange={(e) => setTelegramChatId(e.target.value)}
              placeholder="e.g. 123456789"
              className="w-full px-3 py-2.5 rounded-2xl border border-white/20 bg-white/30 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
        )}

        {/* WhatsApp config */}
        {channel === "whatsapp" && (
          <div className="mt-4">
            <label className="text-sm font-medium text-text-primary block mb-1">
              {t("whatsapp_phone", lang)}
            </label>
            <p className="text-[11px] text-text-tertiary mb-2">{t("whatsapp_hint", lang)}</p>
            <input
              value={whatsappPhone}
              onChange={(e) => setWhatsappPhone(e.target.value)}
              placeholder="e.g. +16045551234"
              className="w-full px-3 py-2.5 rounded-2xl border border-white/20 bg-white/30 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
        )}
      </div>

      {/* Quiet hours */}
      <div
        className="rounded-3xl p-5 mb-4"
        style={{
          background: "var(--glass-bg)",
          backdropFilter: "blur(24px) saturate(180%)",
          WebkitBackdropFilter: "blur(24px) saturate(180%)",
          border: "1px solid var(--glass-border)",
          boxShadow: "var(--glass-shadow)",
        }}
      >
        <p className="text-sm font-medium text-text-primary mb-1">
          {t("quiet_hours", lang)}
        </p>
        <p className="text-xs text-text-tertiary mb-3">
          {t("quiet_hours_desc", lang)}
        </p>
        <div className="flex items-center gap-2">
          <input
            type="time"
            value={quietStart}
            onChange={(e) => setQuietStart(e.target.value)}
            className="flex-1 px-3 py-2.5 rounded-2xl border border-white/20 bg-white/30 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
          <span className="text-text-tertiary text-xs">—</span>
          <input
            type="time"
            value={quietEnd}
            onChange={(e) => setQuietEnd(e.target.value)}
            className="flex-1 px-3 py-2.5 rounded-2xl border border-white/20 bg-white/30 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>
      </div>

      {/* Event toggles */}
      <div
        className="rounded-3xl p-5 mb-4"
        style={{
          background: "var(--glass-bg)",
          backdropFilter: "blur(24px) saturate(180%)",
          WebkitBackdropFilter: "blur(24px) saturate(180%)",
          border: "1px solid var(--glass-border)",
          boxShadow: "var(--glass-shadow)",
        }}
      >
        <p className="text-sm font-medium text-text-primary mb-3">
          {t("notify_me_about", lang)}
        </p>
        <div className="space-y-1">
          {NOTIFICATION_EVENTS.map((evt) => (
            <button
              key={evt.key}
              onClick={() => toggleEvent(evt.key)}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl transition-colors active:scale-[0.98]"
            >
              <div
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                  enabledEvents.includes(evt.key)
                    ? "bg-accent border-accent"
                    : "border-gray-300 bg-transparent"
                }`}
              >
                {enabledEvents.includes(evt.key) && (
                  <span className="material-symbols-outlined text-white text-[14px]">check</span>
                )}
              </div>
              <span className="material-symbols-outlined text-[18px] text-text-tertiary">
                {evt.icon}
              </span>
              <span className="text-sm text-text-primary">
                {t(EVENT_LABEL_KEYS[evt.key], lang)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full rounded-3xl py-3.5 text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-50"
        style={{
          background: "linear-gradient(145deg, var(--accent), #9b7aff)",
          boxShadow: "0 4px 16px rgba(155, 122, 255, 0.3)",
        }}
      >
        {saving ? t("saving", lang) : saved ? t("saved", lang) : t("save_settings", lang)}
      </button>
    </div>
  );
}
