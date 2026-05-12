"use client";

import { useState, useRef } from "react";

type ActionCardProps = {
  id: string;
  urgency: "urgent" | "medium" | "low" | "info";
  title: string;
  context: string;
  attribution?: string;
  timeLabel?: string;
  actions: { label: string; variant: "primary" | "secondary" | "tertiary"; onClick: () => void; completes?: boolean }[];
  onComplete?: () => void;
  onTap?: () => void;
};

const urgencyColors = {
  urgent: "var(--urgent)",
  medium: "var(--medium)",
  low: "var(--low)",
  info: "var(--info)",
};

export default function ActionCard({
  urgency,
  title,
  context,
  attribution,
  timeLabel,
  actions,
  onComplete,
  onTap,
}: ActionCardProps) {
  const [completing, setCompleting] = useState(false);
  const [shimmer, setShimmer] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  function handleComplete() {
    if (completing) return;
    setCompleting(true);

    // Create sparkles
    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      for (let i = 0; i < 12; i++) {
        const sparkle = document.createElement("div");
        sparkle.style.position = "fixed";
        sparkle.style.width = "6px";
        sparkle.style.height = "6px";
        sparkle.style.borderRadius = "50%";
        sparkle.style.pointerEvents = "none";
        sparkle.style.zIndex = "100";
        const colors = ["white", "#fff5cc", "#cce8ff", "#ffd9ec"];
        sparkle.style.background = colors[Math.floor(Math.random() * colors.length)];
        sparkle.style.boxShadow = "0 0 8px white, 0 0 4px var(--accent)";
        sparkle.style.left = `${rect.left + Math.random() * rect.width}px`;
        sparkle.style.top = `${rect.top + Math.random() * rect.height * 0.6 + rect.height * 0.2}px`;
        sparkle.style.opacity = "0";
        sparkle.style.transition = `all ${0.8 + Math.random() * 0.4}s ease-out`;
        document.body.appendChild(sparkle);

        requestAnimationFrame(() => {
          sparkle.style.opacity = "1";
          sparkle.style.transform = `translate(${(Math.random() - 0.5) * 40}px, -80px) scale(0.2)`;
          sparkle.style.opacity = "0";
        });

        setTimeout(() => sparkle.remove(), 1400);
      }
    }

    setTimeout(() => {
      onComplete?.();
    }, 600);
  }

  return (
    <div
      ref={cardRef}
      className={`rounded-3xl p-[18px] mb-4 relative transition-all duration-400 ${
        completing
          ? "scale-92 opacity-0 max-h-0 mb-0 py-0 overflow-hidden"
          : shimmer
          ? "overflow-hidden"
          : ""
      }`}
      style={{
        background: "var(--glass-bg)",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        border: "1px solid var(--glass-border)",
        boxShadow: "var(--glass-shadow)",
        transition: "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s, max-height 0.4s",
      }}
    >
      {/* Tappable area: header + context */}
      <div
        className={onTap ? "cursor-pointer active:opacity-80 transition-opacity" : ""}
        onClick={onTap}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-2">
          <div
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{
              background: urgencyColors[urgency],
              boxShadow: `0 0 12px ${urgencyColors[urgency]}`,
            }}
          />
          <h2 className="font-heading font-semibold text-base text-text-primary flex-1">{title}</h2>
          {timeLabel && (
            <span className="text-[11px] text-text-tertiary whitespace-nowrap flex-shrink-0">{timeLabel}</span>
          )}
          {onTap && (
            <span className="material-symbols-outlined text-text-tertiary text-[18px]">chevron_right</span>
          )}
        </div>

        {/* Context */}
        <p
          className="text-sm leading-[1.45] text-text-secondary mb-3"
          dangerouslySetInnerHTML={{ __html: context }}
        />

        {/* Attribution */}
        {attribution && (
          <p className="text-[11px] text-text-tertiary italic mb-3">{attribution}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {actions.map((action, i) => (
          <button
            key={i}
            onClick={() => {
              if (action.completes) {
                handleComplete();
              }
              action.onClick();
            }}
            className={`text-[13px] font-semibold rounded-[14px] transition-transform active:scale-96 ${
              action.variant === "primary"
                ? "px-4 py-2.5 bg-text-primary text-white shadow-sm"
                : action.variant === "secondary"
                ? "px-4 py-2.5 bg-white/60 text-text-primary border border-white/80"
                : "px-3 py-2.5 text-text-secondary"
            }`}
            style={{
              backdropFilter: action.variant !== "primary" ? "blur(10px)" : undefined,
              WebkitBackdropFilter: action.variant !== "primary" ? "blur(10px)" : undefined,
            }}
          >
            {action.label}
          </button>
        ))}
      </div>

      {/* Shimmer overlay */}
      {shimmer && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-3xl">
          <div
            className="absolute top-0 -left-full w-full h-full"
            style={{
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)",
              animation: "shimmer 1.5s ease-out",
            }}
          />
        </div>
      )}
    </div>
  );
}
