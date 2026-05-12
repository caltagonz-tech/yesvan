/**
 * Time-blindness support — §4.11
 * Returns human-friendly relative time phrases instead of raw dates.
 * Designed to reduce cognitive load for busy operators.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

export function timeAgo(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();

  if (diff < 0) {
    // Future dates
    const absDiff = Math.abs(diff);
    if (absDiff < HOUR) return `in ${Math.max(1, Math.round(absDiff / MINUTE))} min`;
    if (absDiff < DAY) {
      const hrs = Math.round(absDiff / HOUR);
      return `in ${hrs} hr${hrs > 1 ? "s" : ""}`;
    }
    if (absDiff < WEEK) {
      const days = Math.round(absDiff / DAY);
      return days === 1 ? "tomorrow" : `in ${days} days`;
    }
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  // Past dates
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) {
    const mins = Math.round(diff / MINUTE);
    return `${mins} min ago`;
  }
  if (diff < DAY) {
    const hrs = Math.round(diff / HOUR);
    return `${hrs} hr${hrs > 1 ? "s" : ""} ago`;
  }
  if (diff < 2 * DAY) return "yesterday";
  if (diff < WEEK) {
    const days = Math.round(diff / DAY);
    return `${days} days ago`;
  }
  if (diff < 4 * WEEK) {
    const weeks = Math.round(diff / WEEK);
    return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * For deadline-oriented display: "Due in 3 days", "Overdue by 2 days"
 */
export function deadlineLabel(date: string | Date): { text: string; overdue: boolean } {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diff = d.getTime() - now.getTime();

  if (diff < 0) {
    const absDiff = Math.abs(diff);
    if (absDiff < DAY) return { text: "Due today", overdue: true };
    const days = Math.round(absDiff / DAY);
    return { text: `Overdue ${days}d`, overdue: true };
  }

  if (diff < DAY) return { text: "Due today", overdue: false };
  if (diff < 2 * DAY) return { text: "Due tomorrow", overdue: false };
  const days = Math.round(diff / DAY);
  if (days <= 7) return { text: `Due in ${days}d`, overdue: false };
  return { text: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), overdue: false };
}
