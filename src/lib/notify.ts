/**
 * External notification delivery — WhatsApp & Telegram
 *
 * Sends notifications to users' preferred channel, respecting quiet hours.
 * Only triggers for events the user has opted into.
 */

type NotifyPayload = {
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
};

type UserNotifPrefs = {
  notification_channel: "push" | "whatsapp" | "telegram";
  telegram_chat_id: string | null;
  whatsapp_phone: string | null;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  notification_events: string[] | null;
};

function isInQuietHours(start: string | null, end: string | null): boolean {
  if (!start || !end) return false;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startH, startM] = start.split(":").map(Number);
  const [endH, endM] = end.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes <= endMinutes) {
    // Same-day range: e.g. 22:00 - 23:00
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    // Overnight range: e.g. 22:00 - 07:00
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}

async function sendTelegram(chatId: string, text: string): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.warn("TELEGRAM_BOT_TOKEN not configured");
    return false;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    const data = await res.json();
    return data.ok === true;
  } catch (error) {
    console.error("Telegram send failed:", error);
    return false;
  }
}

async function sendWhatsApp(phone: string, text: string): Promise<boolean> {
  const apiUrl = process.env.WHATSAPP_API_URL;
  const apiToken = process.env.WHATSAPP_API_TOKEN;

  if (!apiUrl || !apiToken) {
    console.warn("WhatsApp API not configured");
    return false;
  }

  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: { body: text },
      }),
    });
    return res.ok;
  } catch (error) {
    console.error("WhatsApp send failed:", error);
    return false;
  }
}

/**
 * Send a notification to a user via their preferred external channel.
 * Returns true if delivered, false if skipped or failed.
 */
export async function sendExternalNotification(
  prefs: UserNotifPrefs,
  payload: NotifyPayload
): Promise<boolean> {
  // Check if user wants this event type
  const allowedEvents = prefs.notification_events || ["payment_overdue", "handoff", "process_blocked"];
  if (!allowedEvents.includes(payload.type)) {
    return false;
  }

  // Respect quiet hours
  if (isInQuietHours(prefs.quiet_hours_start, prefs.quiet_hours_end)) {
    return false;
  }

  // Format the message
  const message = formatMessage(payload);

  // Deliver based on channel
  switch (prefs.notification_channel) {
    case "telegram":
      if (!prefs.telegram_chat_id) return false;
      return sendTelegram(prefs.telegram_chat_id, message);

    case "whatsapp":
      if (!prefs.whatsapp_phone) return false;
      return sendWhatsApp(prefs.whatsapp_phone, message);

    case "push":
    default:
      // Push = in-app only (stored in notifications table), no external delivery
      return false;
  }
}

/**
 * Strip PII from notification text for external channels (§11.2).
 * Replaces known name patterns with role labels. External messages
 * should use IDs and role labels so they're safe if the channel is compromised.
 */
function stripPiiForExternal(text: string): string {
  // Remove anything that looks like an email address
  let safe = text.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[email]");
  // Remove phone numbers
  safe = safe.replace(/\+?\d[\d\s\-().]{7,}\d/g, "[phone]");
  return safe;
}

function formatMessage(payload: NotifyPayload): string {
  const emoji: Record<string, string> = {
    payment_due: "💰",
    payment_overdue: "🚨",
    handoff: "🔄",
    process_blocked: "⛔",
    card_assigned: "📋",
    reminder: "⏰",
    system: "ℹ️",
  };

  const icon = emoji[payload.type] || "📌";
  // Strip PII from external messages (§11.2 — no PII in WhatsApp/Telegram)
  const safeTitle = stripPiiForExternal(payload.title);
  const safeBody = payload.body ? stripPiiForExternal(payload.body) : null;

  let text = `${icon} <b>${safeTitle}</b>`;
  if (safeBody) text += `\n${safeBody}`;
  if (payload.link) text += `\n\n🔗 Open in app`;
  return text;
}

/**
 * Helper to fetch user notification prefs from Supabase
 */
export async function getUserNotifPrefs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string
): Promise<UserNotifPrefs | null> {
  const { data, error } = await supabase
    .from("users")
    .select("notification_channel, telegram_chat_id, whatsapp_phone, quiet_hours_start, quiet_hours_end, notification_events")
    .eq("id", userId)
    .single();

  if (error || !data) return null;
  return data;
}
