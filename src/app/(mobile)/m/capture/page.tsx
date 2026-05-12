"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function CapturePage() {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiResult, setAiResult] = useState<{ title: string; category: string; urgency: string; suggested_action: string } | null>(null);
  const router = useRouter();
  const supabase = createClient();

  async function handleSave() {
    if (!text.trim() || saving) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    await supabase.from("quick_captures").insert({
      raw_text: text.trim(),
      created_by: user.id,
    });

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "process_capture", data: { text: text.trim() } }),
      });
      const data = await res.json();
      if (data.card) setAiResult(data.card);
    } catch {}

    setSaved(true);
    setTimeout(() => router.back(), 2500);
  }

  if (saved) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-6">
        <div className="text-4xl mb-3">&#10003;</div>
        <p className="text-text-primary font-medium">Captured</p>
        {aiResult ? (
          <div className="mt-3 rounded-2xl p-4 text-left w-full max-w-sm" style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)" }}>
            <p className="text-xs text-text-tertiary font-medium uppercase tracking-wide mb-1">AI created a card</p>
            <p className="text-sm font-medium text-text-primary">{aiResult.title}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                aiResult.urgency === "urgent" ? "bg-red-100 text-red-700" :
                aiResult.urgency === "medium" ? "bg-amber-100 text-amber-700" :
                "bg-blue-100 text-blue-700"
              }`}>{aiResult.urgency}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-text-secondary font-medium">{aiResult.category}</span>
            </div>
            {aiResult.suggested_action && (
              <p className="text-xs text-text-secondary mt-2">Next: {aiResult.suggested_action}</p>
            )}
          </div>
        ) : (
          <p className="text-text-secondary text-sm mt-1">The AI will sort it for you.</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-text-secondary">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className="font-heading font-semibold text-lg text-text-primary">Quick capture</h1>
      </div>

      <div
        className="rounded-3xl p-5"
        style={{
          background: "var(--glass-bg)",
          backdropFilter: "blur(24px) saturate(180%)",
          WebkitBackdropFilter: "blur(24px) saturate(180%)",
          border: "1px solid var(--glass-border)",
          boxShadow: "var(--glass-shadow)",
        }}
      >
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What's on your mind?"
          className="w-full min-h-[120px] bg-transparent text-text-primary placeholder:text-text-tertiary text-[15px] leading-relaxed resize-none focus:outline-none"
        />

        <div className="flex justify-end mt-3">
          <button
            onClick={handleSave}
            disabled={!text.trim()}
            className="px-5 py-2.5 rounded-[14px] bg-text-primary text-white text-[13px] font-semibold transition-transform active:scale-96 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>

      <p className="text-text-tertiary text-xs text-center mt-4">
        Just drop it here. The AI will figure out where it goes.
      </p>
    </div>
  );
}
