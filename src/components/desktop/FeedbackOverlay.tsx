"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useFeedbackMode } from "@/components/desktop/FeedbackModeContext";

type FeedbackPin = {
  id: string;
  page_url: string;
  element_selector: string | null;
  element_label: string | null;
  element_rect: { x: number; y: number; width: number; height: number } | null;
  comment: string;
  status: string;
  created_at: string;
};

type Popover = {
  x: number;
  y: number;
  selector: string;
  label: string;
  rect: { x: number; y: number; width: number; height: number };
  component?: string;   // e.g. "ActionCard"
  fileHint?: string;    // e.g. "src/components/mobile/ActionCard.tsx"
};

// ── Component → source file map (extend as the codebase grows) ──────────────
const COMPONENT_FILES: Record<string, string> = {
  // Mobile components
  ActionCard:       "src/components/mobile/ActionCard.tsx",
  GreetingBubble:   "src/components/mobile/GreetingBubble.tsx",
  AllClearState:    "src/components/mobile/AllClearState.tsx",
  // Mobile pages
  MobileShell:      "src/app/(mobile)/m/layout.tsx",
  // Desktop components
  DataSheet:        "src/components/desktop/DataSheet.tsx",
  FeedbackOverlay:  "src/components/desktop/FeedbackOverlay.tsx",
  // Desktop pages
  DesktopShell:     "src/app/(desktop)/d/layout.tsx",
};

/**
 * Walk the React fiber tree attached to a DOM node and return the nearest
 * named component (PascalCase) along with a file hint if we know it.
 * Returns null if React internals aren't accessible (e.g. production build
 * without fiber keys, or non-React content).
 */
function getReactComponent(el: HTMLElement): { name: string; file?: string } | null {
  // React attaches fiber under a key like __reactFiber$xxxx
  const fiberKey = Object.keys(el).find(
    k => k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance")
  );
  if (!fiberKey) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fiber = (el as any)[fiberKey];
  const seen = new Set<string>();
  const chain: string[] = [];

  while (fiber && chain.length < 4) {
    const name: unknown = fiber.type?.displayName ?? fiber.type?.name;
    if (
      typeof name === "string" &&
      /^[A-Z]/.test(name) &&          // PascalCase = React component
      !seen.has(name) &&
      !["Router", "Route", "Suspense", "ErrorBoundary",
        "FeedbackModeProvider", "MobileLayout", "DesktopLayout"].includes(name)
    ) {
      seen.add(name);
      chain.push(name);
    }
    fiber = fiber.return;
  }

  if (chain.length === 0) return null;

  const primary = chain[0];
  return {
    name: chain.slice(0, 2).join(" ↳ "),   // e.g. "ActionCard" or "ActionCard ↳ MobileShell"
    file: COMPONENT_FILES[primary],
  };
}

function getSelectorPath(el: HTMLElement): string {
  const parts: string[] = [];
  let current: HTMLElement | null = el;
  let depth = 0;
  while (current && current !== document.body && depth < 4) {
    let part = current.tagName.toLowerCase();
    if (current.id) {
      part += `#${current.id}`;
    } else {
      const classes = Array.from(current.classList)
        .filter(c => !c.startsWith("hover:") && !c.startsWith("focus:") && c.length < 30)
        .slice(0, 2);
      if (classes.length) part += `.${classes.join(".")}`;
    }
    parts.unshift(part);
    current = current.parentElement;
    depth++;
  }
  return parts.join(" > ");
}

function getElementLabel(el: HTMLElement): string {
  const aria = el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.getAttribute("title");
  if (aria) return aria;
  const text = el.innerText?.trim().replace(/\s+/g, " ").slice(0, 60);
  if (text) return text;
  return el.tagName.toLowerCase();
}

/** Walk up the DOM to find the nearest heading or section label for context. */
function getNearestHeading(el: HTMLElement): string | null {
  let current: HTMLElement | null = el;
  while (current && current !== document.body) {
    // Check siblings before this element for a heading
    let sibling = current.previousElementSibling as HTMLElement | null;
    while (sibling) {
      if (/^H[1-6]$/.test(sibling.tagName)) return sibling.innerText.trim().slice(0, 60);
      sibling = sibling.previousElementSibling as HTMLElement | null;
    }
    // Check parent's aria-label or data-section
    if (current.parentElement) {
      const parentAria = current.parentElement.getAttribute("aria-label") || current.parentElement.dataset.section;
      if (parentAria) return parentAria;
    }
    current = current.parentElement;
  }
  return null;
}

/**
 * Find the topmost non-overlay element at (x, y).
 * Uses elementsFromPoint (plural) to skip through the interceptor div.
 */
function getTargetAt(x: number, y: number, overlayEl: HTMLElement | null): HTMLElement | null {
  const all = document.elementsFromPoint(x, y) as HTMLElement[];
  return all.find(el => el !== overlayEl && !overlayEl?.contains(el) && el !== document.documentElement && el !== document.body) ?? null;
}

const OVERLAY_Z = 9000;

export default function FeedbackOverlay({ bottomOffset = 24 }: { bottomOffset?: number }) {
  const supabase = createClient();
  const { feedbackMode, toggleFeedbackMode } = useFeedbackMode();
  const [pins, setPins] = useState<FeedbackPin[]>([]);
  const [hoveredRect, setHoveredRect] = useState<DOMRect | null>(null);
  const [popover, setPopover] = useState<Popover | null>(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [viewingPin, setViewingPin] = useState<FeedbackPin | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const pageUrl = typeof window !== "undefined" ? window.location.pathname : "";

  const loadPins = useCallback(async () => {
    const { data } = await supabase
      .from("feedback_comments")
      .select("*")
      .eq("page_url", pageUrl)
      .eq("status", "open")
      .order("created_at", { ascending: true });
    if (data) setPins(data as FeedbackPin[]);
  }, [supabase, pageUrl]);

  useEffect(() => { loadPins(); }, [loadPins]);

  useEffect(() => {
    if (!feedbackMode) { setHoveredRect(null); setPopover(null); setViewingPin(null); }
  }, [feedbackMode]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setPopover(null); setViewingPin(null); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // ── Interceptor handlers ──────────────────────────────────────────────────
  function handleInterceptorMove(e: React.MouseEvent) {
    if (popover) return;
    const target = getTargetAt(e.clientX, e.clientY, overlayRef.current);
    setHoveredRect(target ? target.getBoundingClientRect() : null);
  }

  function handleInterceptorLeave() {
    setHoveredRect(null);
  }

  function handleInterceptorClick(e: React.MouseEvent) {
    const target = getTargetAt(e.clientX, e.clientY, overlayRef.current);
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const sx = window.scrollX, sy = window.scrollY;

    const elRect = { x: rect.left + sx, y: rect.top + sy, width: rect.width, height: rect.height };

    const POPOVER_W = 288;
    const POPOVER_H = 220;
    const MARGIN = 10;

    // Prefer right of element, fall back to left, then clamp to viewport
    let px = rect.right + sx + 12;
    if (px + POPOVER_W > window.innerWidth + sx - MARGIN) {
      px = rect.left + sx - POPOVER_W - 12;
    }
    // Clamp horizontally so it never goes off either edge
    px = Math.max(sx + MARGIN, Math.min(px, window.innerWidth + sx - POPOVER_W - MARGIN));

    // Prefer top-aligned with element, clamp vertically
    let py = rect.top + sy;
    py = Math.max(sy + MARGIN, Math.min(py, window.innerHeight + sy - POPOVER_H - MARGIN));

    const label = getElementLabel(target);
    const heading = getNearestHeading(target);
    const fullLabel = heading && heading !== label ? `[${heading}] ${label}` : label;
    const reactInfo = getReactComponent(target);
    setPopover({
      x: px, y: py,
      selector: getSelectorPath(target),
      label: fullLabel,
      rect: elRect,
      component: reactInfo?.name,
      fileHint: reactInfo?.file,
    });
    setComment("");
    setHoveredRect(null);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  // ── Supabase actions ──────────────────────────────────────────────────────
  async function submitComment() {
    if (!comment.trim() || !popover) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    // Enrich the label with component + file so Claude can locate it without searching
    const enrichedLabel = [
      popover.component ? `⚛ ${popover.component}` : null,
      popover.fileHint  ? `📄 ${popover.fileHint}` : null,
      popover.label,
    ].filter(Boolean).join(" · ");

    const { data } = await supabase.from("feedback_comments").insert({
      page_url: pageUrl,
      element_selector: popover.selector,
      element_label: enrichedLabel,
      element_rect: popover.rect,
      comment: comment.trim(),
      created_by: user.id,
    }).select().single();
    setSaving(false);
    if (data) {
      setSavedId(data.id);
      await loadPins();
      setTimeout(() => { setSavedId(null); setPopover(null); }, 1200);
    }
  }

  async function resolvePin(pinId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("feedback_comments")
      .update({ status: "resolved", updated_at: new Date().toISOString() })
      .eq("id", pinId);
    setViewingPin(null);
    await loadPins();
  }

  const sx = typeof window !== "undefined" ? window.scrollX : 0;
  const sy = typeof window !== "undefined" ? window.scrollY : 0;

  return (
    <div ref={overlayRef} style={{ position: "fixed", inset: 0, zIndex: OVERLAY_Z, pointerEvents: "none" }}>

      {/* ── Floating toggle button (always reachable) ── */}
      <button
        onClick={toggleFeedbackMode}
        title={feedbackMode ? "Stop annotating" : "Annotate this page"}
        style={{
          position: "fixed",
          bottom: bottomOffset,
          right: 24,
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: feedbackMode ? "#6366f1" : "#fff",
          color: feedbackMode ? "#fff" : "#6366f1",
          border: feedbackMode ? "none" : "2px solid #6366f1",
          boxShadow: feedbackMode ? "0 4px 16px rgba(99,102,241,0.4)" : "0 2px 10px rgba(0,0,0,0.12)",
          cursor: "pointer",
          pointerEvents: "all",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.15s ease",
          zIndex: OVERLAY_Z + 10,
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
          {feedbackMode ? "edit_off" : "mode_comment"}
        </span>
      </button>

      {/* ── Full-screen interceptor — physically blocks all page clicks ── */}
      {feedbackMode && !popover && (
        <div
          onMouseMove={handleInterceptorMove}
          onMouseLeave={handleInterceptorLeave}
          onClick={handleInterceptorClick}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: OVERLAY_Z - 1,
            pointerEvents: "all",
            cursor: "crosshair",
          }}
        />
      )}

      {/* ── Hover highlight ── */}
      {feedbackMode && hoveredRect && (
        <div
          style={{
            position: "fixed",
            top: hoveredRect.top - 2,
            left: hoveredRect.left - 2,
            width: hoveredRect.width + 4,
            height: hoveredRect.height + 4,
            border: "2px solid #6366f1",
            borderRadius: 6,
            background: "rgba(99,102,241,0.08)",
            pointerEvents: "none",
            zIndex: OVERLAY_Z,
          }}
        />
      )}

      {/* ── Existing comment pins ── */}
      {pins.map((pin, i) => {
        if (!pin.element_rect) return null;
        const bx = pin.element_rect.x - sx;
        const by = pin.element_rect.y - sy;
        return (
          <button
            key={pin.id}
            onClick={() => setViewingPin(pin)}
            style={{
              position: "fixed",
              top: by - 10,
              left: bx + pin.element_rect.width - 10,
              width: 22,
              height: 22,
              borderRadius: "50%",
              background: "#6366f1",
              color: "#fff",
              fontSize: 11,
              fontWeight: 700,
              border: "2px solid #fff",
              boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
              cursor: "pointer",
              pointerEvents: "all",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: OVERLAY_Z + 1,
              lineHeight: 1,
            }}
          >
            {i + 1}
          </button>
        );
      })}

      {/* ── New comment popover ── */}
      {popover && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: "absolute",
            top: popover.y - sy,
            left: popover.x - sx,
            width: 280,
            background: "#fff",
            borderRadius: 12,
            boxShadow: "0 8px 32px rgba(0,0,0,0.16), 0 0 0 1px rgba(0,0,0,0.06)",
            padding: 14,
            pointerEvents: "all",
            zIndex: OVERLAY_Z + 2,
          }}
        >
          {/* Component + file hint */}
          {(popover.component || popover.fileHint) && (
            <div style={{ marginBottom: 6 }}>
              {popover.component && (
                <span style={{
                  display: "inline-block", fontSize: 10, fontWeight: 600,
                  background: "rgba(99,102,241,0.1)", color: "#6366f1",
                  borderRadius: 4, padding: "1px 6px", marginRight: 4,
                }}>
                  ⚛ {popover.component}
                </span>
              )}
              {popover.fileHint && (
                <span style={{
                  display: "inline-block", fontSize: 10, fontWeight: 500,
                  background: "#f3f4f6", color: "#6b7280",
                  borderRadius: 4, padding: "1px 6px", fontFamily: "monospace",
                }}>
                  {popover.fileHint}
                </span>
              )}
            </div>
          )}
          <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 8, fontWeight: 500, lineHeight: 1.4 }}>
            <span style={{ color: "#6366f1" }}>● </span>
            <span style={{ wordBreak: "break-all" }}>{popover.label || popover.selector}</span>
          </p>
          {savedId ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#16a34a", fontSize: 13, fontWeight: 500 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check_circle</span>
              Comment saved!
            </div>
          ) : (
            <>
              <textarea
                ref={textareaRef}
                value={comment}
                onChange={e => setComment(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitComment(); }}
                placeholder="Describe the issue or suggestion…"
                rows={3}
                style={{
                  width: "100%",
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 13,
                  resize: "none",
                  outline: "none",
                  fontFamily: "inherit",
                  color: "#111827",
                  background: "#f9fafb",
                  boxSizing: "border-box",
                }}
              />
              <p style={{ fontSize: 10, color: "#9ca3af", margin: "4px 0 8px" }}>⌘ Enter to save</p>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={submitComment}
                  disabled={saving || !comment.trim()}
                  style={{
                    flex: 1,
                    background: comment.trim() ? "#6366f1" : "#e5e7eb",
                    color: comment.trim() ? "#fff" : "#9ca3af",
                    border: "none",
                    borderRadius: 8,
                    padding: "7px 0",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: comment.trim() ? "pointer" : "default",
                  }}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={() => setPopover(null)}
                  style={{
                    padding: "7px 12px",
                    background: "transparent",
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    fontSize: 13,
                    color: "#6b7280",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── View existing pin ── */}
      {viewingPin && viewingPin.element_rect && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: "fixed",
            top: Math.min(viewingPin.element_rect.y - sy - 10, window.innerHeight - 180),
            left: Math.min(viewingPin.element_rect.x - sx + viewingPin.element_rect.width + 12, window.innerWidth - 300),
            width: 280,
            background: "#fff",
            borderRadius: 12,
            boxShadow: "0 8px 32px rgba(0,0,0,0.16), 0 0 0 1px rgba(0,0,0,0.06)",
            padding: 14,
            pointerEvents: "all",
            zIndex: OVERLAY_Z + 2,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <p style={{ fontSize: 11, color: "#6b7280", fontWeight: 500 }}>
              {new Date(viewingPin.created_at).toLocaleDateString()}
            </p>
            <button onClick={() => setViewingPin(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 16, lineHeight: 1 }}>✕</button>
          </div>
          <p style={{ fontSize: 13, color: "#111827", lineHeight: 1.5, marginBottom: 12 }}>{viewingPin.comment}</p>
          {viewingPin.element_label && (
            <p style={{ fontSize: 10, color: "#9ca3af", marginBottom: 10, wordBreak: "break-all" }}>On: {viewingPin.element_label}</p>
          )}
          <button
            onClick={() => resolvePin(viewingPin.id)}
            style={{
              width: "100%",
              background: "#f0fdf4",
              color: "#16a34a",
              border: "1px solid #bbf7d0",
              borderRadius: 8,
              padding: "6px 0",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Mark resolved ✓
          </button>
        </div>
      )}
    </div>
  );
}
