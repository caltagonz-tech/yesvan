"use client";

import { useState, useEffect, useCallback } from "react";

type Email = {
  uid: number;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  seen: boolean;
};

type FullEmail = Email & {
  body: string;
};

type DraftReply = {
  to: string;
  subject: string;
  body: string;
};

export default function EmailPage() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<FullEmail | null>(null);
  const [loadingBody, setLoadingBody] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState<DraftReply | null>(null);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [configuring, setConfiguring] = useState(false);
  const [config, setConfig] = useState({ host: "", username: "", password: "", smtpHost: "" });
  const [savingConfig, setSavingConfig] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "fetch", data: { limit: 30 } }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        if (data.error.includes("not configured")) setConfiguring(true);
      } else {
        setEmails(data.messages || []);
      }
    } catch {
      setError("Failed to connect to email server");
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchEmails(); }, [fetchEmails]);

  async function handleSelectEmail(email: Email) {
    setDraft(null);
    setSendResult(null);
    setLoadingBody(true);
    setSelectedEmail({ ...email, body: email.snippet });

    try {
      const res = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "fetch_one", data: { uid: email.uid } }),
      });
      const data = await res.json();
      if (data.body) {
        setSelectedEmail({ ...email, body: data.body });
      }
    } catch {
      // Keep the snippet as fallback
    }
    setLoadingBody(false);
  }

  async function handleDraftReply() {
    if (!selectedEmail) return;
    setDrafting(true);
    setDraft(null);
    try {
      const res = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "draft_reply",
          data: {
            uid: selectedEmail.uid,
            subject: selectedEmail.subject,
            from: selectedEmail.from,
            body: selectedEmail.body,
          },
        }),
      });
      const data = await res.json();
      if (data.draft) setDraft(data.draft);
      if (data.error) setError(data.error);
    } catch {
      setError("Failed to generate draft");
    }
    setDrafting(false);
  }

  async function handleSend() {
    if (!draft) return;
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", data: draft }),
      });
      const data = await res.json();
      if (data.success) {
        setSendResult("Sent successfully!");
        setTimeout(() => { setDraft(null); setSendResult(null); setSelectedEmail(null); }, 2000);
      } else {
        setSendResult(`Error: ${data.error}`);
      }
    } catch {
      setSendResult("Failed to send");
    }
    setSending(false);
  }

  async function handleSaveConfig() {
    if (!config.host || !config.username || !config.password) return;
    setSavingConfig(true);
    try {
      const res = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_credentials", data: config }),
      });
      const data = await res.json();
      if (data.success) {
        setConfiguring(false);
        setError(null);
        fetchEmails();
      }
    } catch {
      setError("Failed to save credentials");
    }
    setSavingConfig(false);
  }

  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test_connection" }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult(`Connected! ${data.inbox.total} emails, ${data.inbox.unseen} unread`);
      } else {
        setTestResult(`Error: ${data.error}`);
      }
    } catch {
      setTestResult("Connection failed");
    }
    setTesting(false);
  }

  function formatDate(iso: string): string {
    if (!iso) return "";
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
  }

  function extractName(from: string): string {
    const match = from.match(/^(.+?)\s*</);
    return match?.[1]?.trim().replace(/"/g, "") || from.split("@")[0];
  }

  if (configuring) {
    return (
      <div>
        <h1 className="font-heading font-bold text-xl text-text-primary mb-6">Email Setup</h1>
        <div className="max-w-md rounded-2xl border border-gray-200 bg-white p-6">
          <p className="text-sm text-text-secondary mb-4">
            Connect your email to fetch and send emails directly from YES Vancity.
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">IMAP Host</label>
              <input
                value={config.host}
                onChange={(e) => setConfig({ ...config, host: e.target.value })}
                placeholder="imap.yourdomain.com"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">SMTP Host <span className="text-text-tertiary font-normal">(auto-detected if empty)</span></label>
              <input
                value={config.smtpHost}
                onChange={(e) => setConfig({ ...config, smtpHost: e.target.value })}
                placeholder={config.host ? `Auto: ${config.host.toLowerCase().startsWith("imap.") ? config.host.replace(/^imap\./i, "smtp.") : config.host}` : "smtp.yourdomain.com"}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">Email / Username</label>
              <input
                value={config.username}
                onChange={(e) => setConfig({ ...config, username: e.target.value })}
                placeholder="you@yourdomain.com"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">Password</label>
              <input
                type="password"
                value={config.password}
                onChange={(e) => setConfig({ ...config, password: e.target.value })}
                placeholder="••••••••"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
            </div>
            <button
              onClick={handleSaveConfig}
              disabled={savingConfig || !config.host || !config.username || !config.password}
              className="w-full px-4 py-2 rounded-xl bg-text-primary text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"
            >
              {savingConfig ? "Saving..." : "Connect email"}
            </button>
          </div>
          <p className="text-[11px] text-text-tertiary mt-3">
            Credentials are stored in your user profile. IMAP port 993 is used for receiving. SMTP host is auto-detected for common providers (Outlook, Gmail, Yahoo). SMTP tries port 465 (SSL) then 587 (STARTTLS).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading font-bold text-xl text-text-primary">Email</h1>
          <p className="text-xs text-text-tertiary mt-0.5">
            {emails.length} messages · {emails.filter((e) => !e.seen).length} unread
          </p>
        </div>
        <div className="flex items-center gap-2">
          {testResult && (
            <span className="text-xs text-text-secondary">{testResult}</span>
          )}
          <button
            onClick={handleTestConnection}
            disabled={testing}
            className="px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-text-secondary hover:bg-gray-50"
          >
            {testing ? "Testing..." : "Test"}
          </button>
          <button
            onClick={fetchEmails}
            disabled={loading}
            className="px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-text-secondary hover:bg-gray-50"
          >
            <span className="material-symbols-outlined text-[18px] align-middle">refresh</span>
          </button>
          <button
            onClick={() => setConfiguring(true)}
            className="px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-text-secondary hover:bg-gray-50"
          >
            <span className="material-symbols-outlined text-[18px] align-middle">settings</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="animate-pulse text-text-secondary text-sm">Fetching emails...</div>
        </div>
      ) : (
        <div className="flex gap-6">
          {/* Email list */}
          <div className="w-96 flex-shrink-0 rounded-2xl border border-gray-200 bg-white overflow-hidden">
            {emails.length === 0 ? (
              <div className="p-8 text-center">
                <span className="material-symbols-outlined text-[32px] text-text-tertiary">inbox</span>
                <p className="text-sm text-text-tertiary mt-2">No emails found</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50 max-h-[70vh] overflow-y-auto">
                {emails.map((email) => (
                  <button
                    key={email.uid}
                    onClick={() => handleSelectEmail(email)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50/50 transition-colors ${
                      selectedEmail?.uid === email.uid ? "bg-accent/5" : ""
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {!email.seen && (
                        <div className="w-2 h-2 rounded-full bg-accent flex-shrink-0 mt-1.5" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-sm truncate ${!email.seen ? "font-semibold text-text-primary" : "text-text-secondary"}`}>
                            {extractName(email.from)}
                          </span>
                          <span className="text-[11px] text-text-tertiary flex-shrink-0">
                            {formatDate(email.date)}
                          </span>
                        </div>
                        <p className={`text-sm truncate mt-0.5 ${!email.seen ? "text-text-primary" : "text-text-secondary"}`}>
                          {email.subject}
                        </p>
                        {email.snippet && (
                          <p className="text-xs text-text-tertiary truncate mt-0.5">
                            {email.snippet.slice(0, 80)}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Email detail / Draft */}
          <div className="flex-1">
            {selectedEmail ? (
              <div className="rounded-2xl border border-gray-200 bg-white p-6">
                <div className="mb-4">
                  <h2 className="font-heading font-semibold text-base text-text-primary">{selectedEmail.subject}</h2>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-accent text-xs font-bold">
                      {extractName(selectedEmail.from).charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text-primary">{extractName(selectedEmail.from)}</p>
                      <p className="text-[11px] text-text-tertiary">
                        {selectedEmail.from.match(/<(.+)>/)?.[1] || selectedEmail.from} · {formatDate(selectedEmail.date)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-4 mb-4">
                  {loadingBody ? (
                    <div className="animate-pulse text-sm text-text-tertiary">Loading full email...</div>
                  ) : (
                    <p className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
                      {selectedEmail.body || "(Email body not available)"}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDraftReply}
                    disabled={drafting || loadingBody}
                    className="px-4 py-2 rounded-xl bg-text-primary text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
                    {drafting ? "Drafting..." : "AI Draft Reply"}
                  </button>
                </div>

                {/* Draft reply */}
                {draft && (
                  <div className="mt-4 rounded-xl border border-accent/20 bg-accent/5 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="material-symbols-outlined text-[16px] text-accent">edit_note</span>
                      <span className="text-xs font-semibold text-accent uppercase tracking-wide">AI Draft</span>
                    </div>
                    <div className="space-y-2 mb-4">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-text-tertiary w-8">To:</span>
                        <span className="text-text-primary">{draft.to}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-text-tertiary w-8">Subj:</span>
                        <span className="text-text-primary">{draft.subject}</span>
                      </div>
                    </div>
                    <textarea
                      value={draft.body}
                      onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                      className="w-full min-h-[150px] text-sm text-text-primary bg-white rounded-xl border border-gray-200 p-3 focus:outline-none focus:ring-2 focus:ring-accent/30 resize-y"
                    />
                    <div className="flex items-center justify-between mt-3">
                      <button
                        onClick={() => setDraft(null)}
                        className="text-sm text-text-secondary hover:text-text-primary"
                      >
                        Discard
                      </button>
                      <div className="flex items-center gap-2">
                        {sendResult && (
                          <span className={`text-xs ${sendResult.startsWith("Sent") ? "text-green-600" : "text-red-600"}`}>
                            {sendResult}
                          </span>
                        )}
                        <button
                          onClick={handleSend}
                          disabled={sending}
                          className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-[16px]">send</span>
                          {sending ? "Sending..." : "Send"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
                <span className="material-symbols-outlined text-[40px] text-text-tertiary mb-2">mail</span>
                <p className="text-sm text-text-tertiary">Select an email to view it</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
