import { NextRequest, NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

type EmailCredentials = {
  host: string;
  username: string;
  password: string;
  port?: number;
  smtpPort?: number;
  smtpHost?: string;
};

function decodePartBody(headers: string, body: string): string {
  const isBase64 = /content-transfer-encoding:\s*base64/i.test(headers);
  const isQP = /content-transfer-encoding:\s*quoted-printable/i.test(headers);

  let decoded = body.replace(/--$/, "").trim();

  if (isBase64) {
    try {
      decoded = Buffer.from(decoded.replace(/\s/g, ""), "base64").toString("utf-8");
    } catch {
      // keep raw if decode fails
    }
  } else if (isQP) {
    decoded = decoded
      .replace(/=\r?\n/g, "")
      .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  }

  return decoded;
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitHeaderBody(part: string): { headers: string; body: string } {
  let idx = part.indexOf("\r\n\r\n");
  if (idx !== -1) return { headers: part.slice(0, idx), body: part.slice(idx + 4) };
  idx = part.indexOf("\n\n");
  if (idx !== -1) return { headers: part.slice(0, idx), body: part.slice(idx + 2) };
  return { headers: part, body: "" };
}

function extractTextFromSource(raw: string): string {
  const { headers: mainHeaders, body: mainBody } = splitHeaderBody(raw);

  const boundaryMatch = mainHeaders.match(/boundary="?([^\s";]+)"?/i);
  if (boundaryMatch) {
    const boundary = boundaryMatch[1];
    const parts = mainBody.split(`--${boundary}`);

    // First pass: look for text/plain
    for (const part of parts) {
      const lower = part.toLowerCase();
      if (lower.includes("content-type: text/plain") || lower.includes('content-type: text/plain;')) {
        const { headers, body } = splitHeaderBody(part.trim());
        return decodePartBody(headers, body);
      }
    }
    // Second pass: look for text/html
    for (const part of parts) {
      const lower = part.toLowerCase();
      if (lower.includes("content-type: text/html") || lower.includes('content-type: text/html;')) {
        const { headers, body } = splitHeaderBody(part.trim());
        return stripHtml(decodePartBody(headers, body));
      }
    }
  }

  // Non-multipart: check encoding on main message
  const decoded = decodePartBody(mainHeaders, mainBody);

  if (mainHeaders.toLowerCase().includes("content-type: text/html")) {
    return stripHtml(decoded);
  }

  return decoded.trim();
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { action, data } = body;

  // Try fetching with smtp_host column, fall back without it if column doesn't exist yet
  let profile: { roundcube_host?: string; roundcube_username?: string; roundcube_password_encrypted?: string; roundcube_smtp_host?: string } | null = null;
  {
    const { data, error: profileError } = await supabase
      .from("users")
      .select("roundcube_host, roundcube_username, roundcube_password_encrypted, roundcube_smtp_host")
      .eq("id", user.id)
      .single();
    if (profileError?.code === "42703") {
      // Column doesn't exist yet, fetch without it
      const { data: fallback } = await supabase
        .from("users")
        .select("roundcube_host, roundcube_username, roundcube_password_encrypted")
        .eq("id", user.id)
        .single();
      profile = fallback;
    } else {
      profile = data;
    }
  }

  if (!profile?.roundcube_host || !profile?.roundcube_username || !profile?.roundcube_password_encrypted) {
    if (action === "save_credentials") {
      return await handleSaveCredentials(supabase, user.id, data);
    }
    return NextResponse.json({ error: "Email not configured. Add your RoundCube credentials in settings." }, { status: 400 });
  }

  const creds: EmailCredentials = {
    host: profile.roundcube_host,
    username: profile.roundcube_username,
    password: profile.roundcube_password_encrypted,
    smtpHost: profile.roundcube_smtp_host || detectSmtpHost(profile.roundcube_host),
  };

  try {
    switch (action) {
      case "fetch":
        return await handleFetch(creds, data?.limit || 20);
      case "fetch_one":
        return await handleFetchOne(creds, data?.uid);
      case "send":
        return await handleSend(creds, data);
      case "draft_reply":
        return await handleDraftReply(supabase, user.id, creds, data);
      case "save_credentials":
        return await handleSaveCredentials(supabase, user.id, data);
      case "test_connection":
        return await handleTestConnection(creds);
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Email error:", error);
    const msg = error instanceof Error ? error.message : "Email operation failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Auto-detect SMTP host from IMAP host for common providers
function detectSmtpHost(imapHost: string): string {
  const h = imapHost.toLowerCase();
  // Outlook / Hotmail / Live
  if (h.includes("outlook") || h.includes("hotmail") || h.includes("live")) {
    return "smtp-mail.outlook.com";
  }
  // Gmail
  if (h.includes("gmail") || h.includes("googlemail")) {
    return "smtp.gmail.com";
  }
  // Yahoo
  if (h.includes("yahoo")) {
    return "smtp.mail.yahoo.com";
  }
  // iCloud
  if (h.includes("icloud") || h.includes("me.com") || h.includes("mac.com")) {
    return "smtp.mail.me.com";
  }
  // Zoho
  if (h.includes("zoho")) {
    return "smtp.zoho.com";
  }
  // Default: try replacing "imap" with "smtp" in the host, or use same host
  if (h.startsWith("imap.")) {
    return h.replace("imap.", "smtp.");
  }
  return imapHost;
}

function createImapClient(creds: EmailCredentials) {
  return new ImapFlow({
    host: creds.host,
    port: creds.port || 993,
    secure: true,
    auth: { user: creds.username, pass: creds.password },
    logger: false,
  });
}

async function handleFetch(creds: EmailCredentials, limit: number) {
  const client = createImapClient(creds);
  await client.connect();

  const lock = await client.getMailboxLock("INBOX");
  try {
    const messages: {
      uid: number;
      from: string;
      to: string;
      subject: string;
      date: string;
      snippet: string;
      seen: boolean;
    }[] = [];

    const mailbox = client.mailbox;
    const totalMessages = mailbox && typeof mailbox === "object" && "exists" in mailbox ? (mailbox as { exists: number }).exists : 0;
    if (totalMessages === 0) {
      return NextResponse.json({ messages: [], count: 0 });
    }
    const seqRange = Math.max(1, totalMessages - limit + 1) + ":*";

    for await (const msg of client.fetch(seqRange, {
      uid: true,
      envelope: true,
      flags: true,
      bodyStructure: true,
      source: { maxLength: 8192 },
    })) {
      const from = msg.envelope?.from?.[0];
      const to = msg.envelope?.to?.[0];

      let snippet = "";
      if (msg.source) {
        const fullText = extractTextFromSource(msg.source.toString());
        snippet = fullText.slice(0, 300);
      }

      messages.push({
        uid: msg.uid,
        from: from ? `${from.name || ""} <${from.address || ""}>`.trim() : "Unknown",
        to: to ? `${to.name || ""} <${to.address || ""}>`.trim() : "",
        subject: msg.envelope?.subject || "(no subject)",
        date: msg.envelope?.date?.toISOString() || "",
        snippet,
        seen: msg.flags?.has("\\Seen") || false,
      });
    }

    messages.reverse();

    return NextResponse.json({ messages, count: messages.length });
  } finally {
    lock.release();
    await client.logout();
  }
}

async function handleFetchOne(creds: EmailCredentials, uid: number) {
  if (!uid) {
    return NextResponse.json({ error: "Missing uid" }, { status: 400 });
  }

  const client = createImapClient(creds);
  await client.connect();

  const lock = await client.getMailboxLock("INBOX");
  try {
    const rawMsg = await client.fetchOne(String(uid), {
      uid: true,
      envelope: true,
      flags: true,
      source: true,
    }, { uid: true });

    if (!rawMsg || typeof rawMsg !== "object") {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = rawMsg as any;
    const from = msg.envelope?.from?.[0];
    const to = msg.envelope?.to?.[0];
    const bodyText = msg.source ? extractTextFromSource(msg.source.toString()) : "";

    return NextResponse.json({
      uid: msg.uid,
      from: from ? `${from.name || ""} <${from.address || ""}>`.trim() : "Unknown",
      to: to ? `${to.name || ""} <${to.address || ""}>`.trim() : "",
      subject: msg.envelope?.subject || "(no subject)",
      date: msg.envelope?.date?.toISOString() || "",
      body: bodyText,
      seen: msg.flags?.has("\\Seen") || false,
    });
  } finally {
    lock.release();
    await client.logout();
  }
}

async function handleSend(creds: EmailCredentials, data: { to: string; subject: string; body: string; replyTo?: string }) {
  if (!data?.to || !data?.subject || !data?.body) {
    return NextResponse.json({ error: "Missing to, subject, or body" }, { status: 400 });
  }

  const smtpHost = creds.smtpHost || creds.host;

  // Try secure connection first (port 465), then STARTTLS (port 587)
  const configs = [
    { host: smtpHost, port: 465, secure: true },
    { host: smtpHost, port: 587, secure: false },
  ];

  let lastError: Error | null = null;

  for (const cfg of configs) {
    try {
      const transport = nodemailer.createTransport({
        host: cfg.host,
        port: creds.smtpPort || cfg.port,
        secure: cfg.secure,
        auth: { user: creds.username, pass: creds.password },
        tls: { rejectUnauthorized: false },
      });

      const info = await transport.sendMail({
        from: creds.username,
        to: data.to,
        subject: data.subject,
        text: data.body,
        inReplyTo: data.replyTo,
      });

      return NextResponse.json({ success: true, messageId: info.messageId });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (creds.smtpPort) break;
    }
  }

  const errMsg = lastError?.message || "Failed to send email";
  if (errMsg.includes("535") || errMsg.includes("authentication")) {
    throw new Error(
      `SMTP authentication failed on ${creds.smtpHost || creds.host}. ` +
      `Check your password or use an app-specific password. ` +
      `If your IMAP host differs from SMTP, set the SMTP host in Email Settings.`
    );
  }
  throw lastError || new Error("Failed to send email");
}

async function handleDraftReply(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  creds: EmailCredentials,
  data: { uid: number; subject: string; from: string; body: string }
) {
  // If body is short/empty, try to fetch the full email
  let emailBody = data.body || "";
  if (emailBody.length < 50 && data.uid) {
    try {
      const client = createImapClient(creds);
      await client.connect();
      const lock = await client.getMailboxLock("INBOX");
      try {
        const msg = await client.fetchOne(String(data.uid), { source: true }, { uid: true });
        if (msg && typeof msg === "object" && "source" in msg && msg.source) {
          emailBody = extractTextFromSource((msg.source as Buffer).toString());
        }
      } finally {
        lock.release();
        await client.logout();
      }
    } catch {
      // Fall back to what we have
    }
  }

  const { data: entities } = await supabase
    .from("students")
    .select("display_id, first_name, last_name, email, phone")
    .eq("archived", false);

  let anonymizedBody = emailBody;
  const idMap: Record<string, string> = {};

  if (entities) {
    for (const entity of entities) {
      const fullName = `${entity.first_name} ${entity.last_name}`;
      if (anonymizedBody.includes(fullName)) {
        anonymizedBody = anonymizedBody.replaceAll(fullName, entity.display_id);
        idMap[entity.display_id] = fullName;
      }
      if (entity.first_name && anonymizedBody.includes(entity.first_name)) {
        anonymizedBody = anonymizedBody.replaceAll(entity.first_name, entity.display_id);
        idMap[entity.display_id] = entity.first_name;
      }
      if (entity.email && anonymizedBody.includes(entity.email)) {
        anonymizedBody = anonymizedBody.replaceAll(entity.email, `[email-${entity.display_id}]`);
        idMap[`[email-${entity.display_id}]`] = entity.email;
      }
      if (entity.phone && anonymizedBody.includes(entity.phone)) {
        anonymizedBody = anonymizedBody.replaceAll(entity.phone, `[phone-${entity.display_id}]`);
        idMap[`[phone-${entity.display_id}]`] = entity.phone;
      }
    }
  }

  const prompt = `You are replying to an email for a student exchange agency. Draft a professional, warm reply.

Original email from: ${data.from}
Subject: ${data.subject}
Body:
${anonymizedBody.slice(0, 1500)}

Write a concise reply. Use the entity IDs as-is (like STU-001) — they will be replaced with real names before sending.
Keep it professional but friendly. Sign off as the YES Vancity team.
Return ONLY the email body text, no subject line.`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
  });

  let draftBody = message.content[0].type === "text" ? message.content[0].text : "";

  for (const [id, real] of Object.entries(idMap)) {
    draftBody = draftBody.replaceAll(id, real);
  }

  const reSubject = data.subject.startsWith("Re:") ? data.subject : `Re: ${data.subject}`;
  const cardTitle = `Reply: ${data.subject.slice(0, 50)}`;
  const emailTo = data.from.match(/<(.+)>/)?.[1] || data.from;

  // Deduplication: check if an active email card for this subject already exists
  // First try exact match, then fuzzy match on similar subjects (e.g. "Studies" vs "Studying")
  const { data: existing } = await supabase
    .from("action_cards")
    .select("id, title")
    .eq("category", "email")
    .eq("assigned_to", userId)
    .in("status", ["active", "snoozed"])
    .ilike("title", `Reply: %${data.subject.slice(0, 20).replace(/[%_]/g, "")}%`)
    .order("created_at", { ascending: false })
    .limit(5);

  // Pick the best match: exact first, then any fuzzy match from same sender
  const exactMatch = existing?.find((c: { title: string }) => c.title === cardTitle);
  const bestMatch = exactMatch || (existing && existing.length > 0 ? existing[0] : null);

  if (bestMatch) {
    // Update the existing card with the fresh draft instead of creating a duplicate
    await supabase.from("action_cards").update({
      title: cardTitle,
      draft_email_body: draftBody,
      draft_email_subject: reSubject,
      draft_email_to: emailTo,
      context: `Draft reply to ${data.from}`,
      updated_by: userId,
    }).eq("id", bestMatch.id);

    return NextResponse.json({
      draft: { to: emailTo, subject: reSubject, body: draftBody },
      card_created: false,
      card_updated: true,
    });
  }

  await supabase.from("action_cards").insert({
    category: "email",
    urgency: "medium",
    title: cardTitle,
    context: `Draft reply to ${data.from}`,
    draft_email_subject: reSubject,
    draft_email_body: draftBody,
    draft_email_to: emailTo,
    status: "active",
    assigned_to: userId,
    source_user_id: userId,
    created_by: userId,
  });

  return NextResponse.json({
    draft: { to: emailTo, subject: reSubject, body: draftBody },
    card_created: true,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSaveCredentials(supabase: any, userId: string, data: { host: string; username: string; password: string; smtpHost?: string }) {
  if (!data?.host || !data?.username || !data?.password) {
    return NextResponse.json({ error: "Missing host, username, or password" }, { status: 400 });
  }

  const smtpHost = data.smtpHost || detectSmtpHost(data.host);

  const updateData: Record<string, string> = {
    roundcube_host: data.host,
    roundcube_username: data.username,
    roundcube_password_encrypted: data.password,
    roundcube_smtp_host: smtpHost,
  };

  const { error: updateError } = await supabase.from("users").update(updateData).eq("id", userId);

  // If smtp_host column doesn't exist yet, save without it
  if (updateError?.code === "42703") {
    const { roundcube_smtp_host: _, ...basicData } = updateData;
    void _;
    await supabase.from("users").update(basicData).eq("id", userId);
  }

  return NextResponse.json({ success: true, smtpHost });
}

async function handleTestConnection(creds: EmailCredentials) {
  const client = createImapClient(creds);
  await client.connect();
  const status = await client.status("INBOX", { messages: true, unseen: true });
  await client.logout();

  return NextResponse.json({
    success: true,
    inbox: { total: status.messages, unseen: status.unseen },
  });
}
