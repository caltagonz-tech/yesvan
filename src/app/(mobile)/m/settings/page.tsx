"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { t, type Lang } from "@/lib/i18n";

export default function MobileSettingsPage() {
  const [lang, setLang] = useState<Lang>("en");
  const [darkMode, setDarkMode] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [userName, setUserName] = useState("");
  const [notifChannel, setNotifChannel] = useState("push");
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    const stored = localStorage.getItem("yes-lang") as Lang | null;
    if (stored) setLang(stored);
    const dark = localStorage.getItem("yes-dark") === "true";
    setDarkMode(dark);
    const motion = localStorage.getItem("yes-reduced-motion") === "true";
    setReducedMotion(motion);

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from("users").select("first_name, last_name, preferred_language, notification_channel").eq("id", user.id).single()
          .then(({ data }) => {
            if (data) {
              setUserName(`${data.first_name} ${data.last_name}`.trim());
              if (data.preferred_language && !stored) {
                setLang(data.preferred_language as Lang);
              }
              if (data.notification_channel) {
                setNotifChannel(data.notification_channel);
              }
            }
          });
      }
    });
  }, [supabase]);

  function toggleLang() {
    const next = lang === "en" ? "es" : "en";
    setLang(next);
    localStorage.setItem("yes-lang", next);
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from("users").update({ preferred_language: next, updated_by: user.id }).eq("id", user.id);
      }
    });
  }

  function toggleDark() {
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem("yes-dark", String(next));
    document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
  }

  function toggleMotion() {
    const next = !reducedMotion;
    setReducedMotion(next);
    localStorage.setItem("yes-reduced-motion", String(next));
    document.documentElement.classList.toggle("reduce-motion", next);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div>
      <h1 className="font-heading font-semibold text-lg text-text-primary mb-6">{t("settings", lang)}</h1>

      {userName && (
        <div
          className="rounded-3xl p-4 mb-4 flex items-center gap-3"
          style={{
            background: "var(--glass-bg)",
            backdropFilter: "blur(24px) saturate(180%)",
            WebkitBackdropFilter: "blur(24px) saturate(180%)",
            border: "1px solid var(--glass-border)",
          }}
        >
          <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-sm">
            {userName.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium text-text-primary">{userName}</p>
            <p className="text-xs text-text-tertiary">YES Vancity</p>
          </div>
        </div>
      )}

      <div
        className="rounded-3xl p-1 mb-4"
        style={{
          background: "var(--glass-bg)",
          backdropFilter: "blur(24px) saturate(180%)",
          WebkitBackdropFilter: "blur(24px) saturate(180%)",
          border: "1px solid var(--glass-border)",
          boxShadow: "var(--glass-shadow)",
        }}
      >
        <SettingRow
          icon="translate"
          label={t("language", lang)}
          value={lang === "en" ? t("english", lang) : t("spanish", lang)}
          onClick={toggleLang}
        />
        <Divider />
        <SettingRow
          icon="dark_mode"
          label={t("dark_mode", lang)}
          toggle
          checked={darkMode}
          onClick={toggleDark}
        />
        <Divider />
        <SettingRow
          icon="accessibility_new"
          label={t("reduced_motion", lang)}
          toggle
          checked={reducedMotion}
          onClick={toggleMotion}
        />
        <Divider />
        <Link href="/m/settings/notifications" className="block">
          <SettingRow
            icon="notifications"
            label={t("notifications", lang)}
            value={notifChannel === "telegram" ? "Telegram" : notifChannel === "whatsapp" ? "WhatsApp" : t("push", lang)}
          />
        </Link>
      </div>

      <button
        onClick={handleSignOut}
        className="w-full rounded-3xl p-4 text-sm font-medium text-red-500 text-center transition-transform active:scale-[0.98]"
        style={{
          background: "var(--glass-bg)",
          backdropFilter: "blur(24px) saturate(180%)",
          WebkitBackdropFilter: "blur(24px) saturate(180%)",
          border: "1px solid var(--glass-border)",
        }}
      >
        {t("sign_out", lang)}
      </button>

      <p className="text-text-tertiary text-[11px] text-center mt-6">YES Vancity v1.0</p>
    </div>
  );
}

function SettingRow({ icon, label, value, toggle, checked, onClick }: {
  icon: string;
  label: string;
  value?: string;
  toggle?: boolean;
  checked?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl hover:bg-white/10 transition-colors"
    >
      <div className="flex items-center gap-3">
        <span className="material-symbols-outlined text-[20px] text-text-secondary">{icon}</span>
        <span className="text-sm text-text-primary">{label}</span>
      </div>
      {toggle ? (
        <div className={`w-11 h-6 rounded-full relative transition-colors ${checked ? "bg-accent" : "bg-gray-300"}`}>
          <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`} />
        </div>
      ) : value ? (
        <div className="flex items-center gap-1">
          <span className="text-sm text-text-secondary">{value}</span>
          <span className="material-symbols-outlined text-[16px] text-text-tertiary">chevron_right</span>
        </div>
      ) : null}
    </button>
  );
}

function Divider() {
  return <div className="mx-4 h-px bg-white/10" />;
}
