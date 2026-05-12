import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/cleanup
 * Deduplicates action cards: keeps the newest card per (normalized title, category)
 * and dismisses older duplicates. Fuzzy-matches similar titles (e.g. "Studies" vs "Studying").
 */
export async function POST() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: cards, error } = await supabase
    .from("action_cards")
    .select("id, title, category, status, created_at")
    .eq("assigned_to", user.id)
    .in("status", ["active", "snoozed"])
    .order("created_at", { ascending: false });

  if (error || !cards) {
    return NextResponse.json({ error: error?.message || "No cards" }, { status: 500 });
  }

  function normalizeTitle(title: string): string {
    return title.toLowerCase().replace(/^reply:\s*/i, "").replace(/\s+/g, " ").trim();
  }

  function areSimilar(a: string, b: string): boolean {
    if (a === b) return true;
    const wordsA = new Set(a.split(" "));
    const wordsB = new Set(b.split(" "));
    const intersection = [...wordsA].filter(w => wordsB.has(w));
    const unionSize = new Set([...wordsA, ...wordsB]).size;
    return unionSize > 0 && intersection.length / unionSize >= 0.5;
  }

  type CardType = typeof cards[number];
  const groups: CardType[][] = [];

  for (const card of cards) {
    const normTitle = normalizeTitle(card.title || "");
    let placed = false;
    for (const group of groups) {
      const groupNorm = normalizeTitle(group[0].title || "");
      if (card.category === group[0].category && areSimilar(normTitle, groupNorm)) {
        group.push(card);
        placed = true;
        break;
      }
    }
    if (!placed) groups.push([card]);
  }

  const markedDismissed: string[] = [];

  for (const group of groups) {
    if (group.length <= 1) continue;
    const [, ...duplicates] = group;
    for (const dup of duplicates) {
      const { error: updateErr } = await supabase
        .from("action_cards")
        .update({ status: "dismissed", updated_by: user.id })
        .eq("id", dup.id);
      if (!updateErr) markedDismissed.push(dup.id);
    }
  }

  return NextResponse.json({
    totalCards: cards.length,
    duplicatesDismissed: markedDismissed.length,
  });
}
