"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { timeAgo } from "@/lib/timeago";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
};

const TYPE_ICONS: Record<string, string> = {
  card_assigned: "assignment_ind",
  payment_due: "payments",
  payment_overdue: "warning",
  handoff: "swap_horiz",
  process_blocked: "block",
  reminder: "alarm",
  system: "info",
};

const TYPE_COLORS: Record<string, string> = {
  card_assigned: "text-accent",
  payment_due: "text-amber-500",
  payment_overdue: "text-red-500",
  handoff: "text-blue-500",
  process_blocked: "text-red-500",
  reminder: "text-amber-500",
  system: "text-text-tertiary",
};

export default function NotificationBell({ variant = "desktop" }: { variant?: "desktop" | "mobile" }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (data) {
        setNotifications(data);
        setUnreadCount(data.filter((n: Notification) => !n.read).length);
      }
    }
    load();

    // Realtime subscription
    const channel = supabase
      .channel("notifications-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, () => {
        load();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase]);

  // Close panel on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function markAllRead() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false);

    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }

  async function markRead(id: string) {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    setUnreadCount((c) => Math.max(0, c - 1));
  }

  const bellSize = variant === "mobile" ? "text-2xl" : "text-xl";

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative p-1.5 rounded-xl transition-colors hover:bg-gray-100"
      >
        <span
          className={`material-symbols-outlined ${bellSize} ${unreadCount > 0 ? "text-text-primary" : "text-text-tertiary"}`}
          style={unreadCount > 0 ? { fontVariationSettings: "'FILL' 1" } : {}}
        >
          notifications
        </span>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 min-w-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none px-1">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className={`absolute z-50 rounded-2xl shadow-xl border border-gray-200 bg-white overflow-hidden ${
            variant === "mobile"
              ? "top-full mt-2 right-0 w-[calc(100vw-2rem)] max-w-sm"
              : "top-full mt-2 right-0 w-80"
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="font-heading font-semibold text-sm text-text-primary">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-[11px] text-accent font-medium hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notification list */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <span className="material-symbols-outlined text-3xl text-text-tertiary mb-2 block">notifications_off</span>
                <p className="text-sm text-text-tertiary">No notifications yet</p>
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    if (!n.read) markRead(n.id);
                    if (n.link) window.location.href = n.link;
                    setOpen(false);
                  }}
                  className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors hover:bg-gray-50 ${
                    !n.read ? "bg-accent/5" : ""
                  }`}
                >
                  <span className={`material-symbols-outlined text-lg mt-0.5 ${TYPE_COLORS[n.type] || "text-text-tertiary"}`}>
                    {TYPE_ICONS[n.type] || "circle_notifications"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm leading-snug ${!n.read ? "font-medium text-text-primary" : "text-text-secondary"}`}>
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="text-xs text-text-tertiary mt-0.5 truncate">{n.body}</p>
                    )}
                    <p className="text-[10px] text-text-tertiary mt-1">{timeAgo(n.created_at)}</p>
                  </div>
                  {!n.read && (
                    <div className="w-2 h-2 rounded-full bg-accent flex-shrink-0 mt-1.5" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
