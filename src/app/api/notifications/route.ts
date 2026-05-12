import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendExternalNotification, getUserNotifPrefs } from "@/lib/notify";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { action, data } = body;

  try {
    switch (action) {
      case "create": {
        const { userId, type, title, body: notifBody, link } = data;

        // Save in-app notification (for desktop bell)
        const { error } = await supabase.from("notifications").insert({
          user_id: userId,
          type,
          title,
          body: notifBody || null,
          link: link || null,
        });
        if (error && error.code !== "42P01") {
          // 42P01 = table doesn't exist yet, ignore
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Send external notification (WhatsApp/Telegram) — non-blocking
        try {
          const prefs = await getUserNotifPrefs(supabase, userId);
          if (prefs) {
            await sendExternalNotification(prefs, { userId, type, title, body: notifBody, link });
          }
        } catch (extErr) {
          console.error("External notification failed:", extErr);
          // Don't fail the whole request if external delivery fails
        }

        return NextResponse.json({ success: true });
      }

      case "mark_read": {
        const { id } = data;
        await supabase.from("notifications").update({ read: true }).eq("id", id);
        return NextResponse.json({ success: true });
      }

      case "mark_all_read": {
        await supabase
          .from("notifications")
          .update({ read: true })
          .eq("user_id", user.id)
          .eq("read", false);
        return NextResponse.json({ success: true });
      }

      case "check_due_payments": {
        // Check for payments due soon and create notifications
        const now = new Date();
        const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

        const { data: duePayments } = await supabase
          .from("payments")
          .select("id, description, amount, due_date, display_id")
          .eq("status", "pending")
          .lte("due_date", threeDaysFromNow.toISOString().split("T")[0])
          .gte("due_date", now.toISOString().split("T")[0]);

        const { data: overduePayments } = await supabase
          .from("payments")
          .select("id, description, amount, due_date, display_id")
          .eq("status", "pending")
          .lt("due_date", now.toISOString().split("T")[0]);

        const notifications = [];

        if (duePayments) {
          for (const p of duePayments) {
            notifications.push({
              user_id: user.id,
              type: "payment_due",
              title: `Payment due soon: ${p.description || p.display_id}`,
              body: `$${Number(p.amount).toLocaleString("en-CA", { minimumFractionDigits: 2 })} due ${p.due_date}`,
              link: "/d/payments",
            });
          }
        }

        if (overduePayments) {
          for (const p of overduePayments) {
            notifications.push({
              user_id: user.id,
              type: "payment_overdue",
              title: `Overdue: ${p.description || p.display_id}`,
              body: `$${Number(p.amount).toLocaleString("en-CA", { minimumFractionDigits: 2 })} was due ${p.due_date}`,
              link: "/d/payments",
            });
          }
        }

        if (notifications.length > 0) {
          await supabase.from("notifications").insert(notifications);
        }

        return NextResponse.json({ created: notifications.length });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
