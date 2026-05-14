"use client";

import { useState, useEffect, useLayoutEffect, useRef } from "react";

type GreetingBubbleProps = {
  message: string;
};

/** Count visible (non-tag) characters in an HTML string. */
function htmlTextLength(html: string): number {
  let count = 0;
  let i = 0;
  while (i < html.length) {
    if (html[i] === "<") {
      const end = html.indexOf(">", i);
      if (end === -1) break;
      i = end + 1;
    } else {
      count++;
      i++;
    }
  }
  return count;
}

/**
 * Build a partial HTML string showing only `visibleLength` text characters.
 * HTML tags are emitted in full (they don't count toward the limit).
 */
function typewriterHtml(html: string, visibleLength: number): string {
  let count = 0;
  let result = "";
  let i = 0;
  while (i < html.length) {
    if (html[i] === "<") {
      const end = html.indexOf(">", i);
      if (end === -1) break;
      result += html.slice(i, end + 1);
      i = end + 1;
    } else {
      if (count >= visibleLength) break;
      result += html[i];
      count++;
      i++;
    }
  }
  return result;
}

const SPEED_MS = 16;

export default function GreetingBubble({ message }: GreetingBubbleProps) {
  const [visibleLength, setVisibleLength] = useState(0);
  const [done, setDone] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const totalLength = htmlTextLength(message);

  // ── Typewriter ticker ─────────────────────────────────────────────────────
  useEffect(() => {
    setVisibleLength(0);
    setDone(false);

    // Reset the bubble to un-pinned height when a new message arrives
    if (bubbleRef.current) {
      bubbleRef.current.style.transition = "none";
      bubbleRef.current.style.height = "";
    }

    if (!message) return;

    intervalRef.current = setInterval(() => {
      setVisibleLength((prev) => {
        const next = prev + 1;
        if (next >= totalLength) {
          clearInterval(intervalRef.current!);
          setDone(true);
          return totalLength;
        }
        return next;
      });
    }, SPEED_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [message, totalLength]);

  const displayedHtml = done
    ? message
    : typewriterHtml(message, visibleLength) +
      `<span style="display:inline-block;width:2px;height:1em;background:currentColor;` +
      `opacity:0.6;margin-left:1px;vertical-align:text-bottom;` +
      `animation:blink 0.8s step-end infinite;"></span>`;

  // ── Smooth height growth (fires before browser paint) ─────────────────────
  // scrollHeight = full natural content height
  // offsetHeight  = current explicit height (content is clipped by overflow:hidden)
  // When a line wraps: scrollHeight > offsetHeight → animate from old to new.
  // When done: the cursor span disappears and scrollHeight may shift slightly —
  // we correct it here (before paint) so there is never a visible flicker.
  useLayoutEffect(() => {
    const el = bubbleRef.current;
    if (!el) return;

    const naturalH = el.scrollHeight;

    if (done) {
      // Final correction — cursor just disappeared, nudge to exact final height
      const currentH = parseFloat(el.style.height) || 0;
      if (Math.abs(naturalH - currentH) > 0.5) {
        el.style.transition = "height 0.15s ease";
        el.style.height = `${naturalH}px`;
      }
      return;
    }

    // First character — pin height without a transition (no initial flash)
    if (!el.style.height) {
      el.style.transition = "none";
      el.style.height = `${naturalH}px`;
      return;
    }

    const currentH = parseFloat(el.style.height);

    if (naturalH > currentH) {
      // A line just wrapped: animate the bubble open smoothly
      requestAnimationFrame(() => {
        el.style.transition = "height 0.22s cubic-bezier(0.4, 0, 0.2, 1)";
        el.style.height = `${naturalH}px`;
      });
    }
  }, [displayedHtml, done]);

  return (
    <div className="relative mb-6">
      <style>{`@keyframes blink { 0%,100%{opacity:0.6} 50%{opacity:0} }`}</style>
      <div
        ref={bubbleRef}
        className="rounded-3xl px-5 py-[18px]"
        style={{
          background: "var(--bubble-bg)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255, 255, 255, 0.7)",
          boxShadow: "0 4px 20px rgba(100, 200, 220, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.9)",
          overflow: "hidden", // clips wrapped content until the animation reveals it
        }}
      >
        <p
          className="text-base leading-relaxed text-text-primary"
          dangerouslySetInnerHTML={{ __html: displayedHtml }}
        />
      </div>
      {/* Bubble tail */}
      <div
        className="absolute -bottom-2 left-6 w-4 h-4 rotate-45"
        style={{
          background: "var(--bubble-bg)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderRight: "1px solid rgba(255, 255, 255, 0.7)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.7)",
        }}
      />
    </div>
  );
}
